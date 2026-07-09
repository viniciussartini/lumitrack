import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { env } from "@/config/env.js"
import { UnauthorizedError, ForbiddenError } from "@/shared/errors/AppError.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { PrismaClient, Role } from "@/generated/prisma/client.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { validateCsrf } from "@/shared/security/csrf.js"

// Extendemos o tipo Request do Express para incluir o usuário autenticado.
// Isso evita usar `any` e mantém a tipagem segura em todos os controllers.
export interface AuthenticatedRequest extends Request {
    user: {
        id: string
        email: string
        userType: string
        // RBAC mínimo (#16) — sempre lida do banco a cada requisição (ver
        // abaixo), nunca um claim do JWT, para que promover/rebaixar um
        // admin tenha efeito imediato sem exigir novo login.
        role: Role
    }
    // De onde o token foi extraído nesta requisição — usado para decidir se
    // a checagem de CSRF se aplica (só faz sentido para "cookie", já que
    // "header" é Bearer explícito, inerentemente resistente a CSRF) e para
    // o logout saber se há cookies a limpar.
    authSource: "header" | "cookie"
    // Token JWT puro (não o hash) — guardado para reuso no logout, evitando
    // reparsing do header/cookie ali.
    authToken: string
}

// Métodos HTTP "seguros" (RFC 7231 §4.2.1) nunca exigem CSRF — não mutam
// estado, então não há nada para um atacante forjar via cross-site request.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function createAuthenticateMiddleware(prisma: PrismaClient) {
    const authRepository = new AuthRepository(prisma)

    return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
        try {
            // Header Authorization tem prioridade sobre o cookie — garante
            // que requisições MOBILE (que sempre mandam o header) nunca são
            // desviadas para o caminho de cookie/CSRF, mesmo que um cookie
            // também esteja presente.
            const authHeader = req.headers.authorization
            let token: string | undefined
            let authSource: "header" | "cookie"

            if (authHeader?.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1]
                authSource = "header"

                if (!token) {
                    throw new UnauthorizedError("Token malformado")
                }
            } else {
                token = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined
                authSource = "cookie"

                if (!token) {
                    throw new UnauthorizedError("Token não fornecido")
                }
            }

            const payload = jwt.verify(token, env.JWT_SECRET) as Omit<AuthenticatedRequest["user"], "role">
            const storedToken = await authRepository.findActiveToken(hashToken(token))

            if (!storedToken) {
                throw new UnauthorizedError("Token inválido")
            }

            if (storedToken.revokedAt !== null) {
                throw new UnauthorizedError("Token revogado")
            }

            if (storedToken.expiresAt !== null && storedToken.expiresAt < new Date()) {
                throw new UnauthorizedError("Token expirado")
            }

            // CSRF só é avaliado AQUI — depois que o JWT já foi validado como
            // íntegro, não revogado e não expirado. Isso garante que uma
            // requisição sem sessão válida sempre recebe 401 (não 403), e só
            // quando a sessão é válida mas o CSRF falha é que cai em 403.
            if (
                authSource === "cookie" &&
                !SAFE_METHODS.has(req.method) &&
                !validateCsrf(
                    req.cookies?.[env.CSRF_COOKIE_NAME] as string | undefined,
                    req.headers[env.CSRF_HEADER_NAME] as string | undefined,
                )
            ) {
                throw new ForbiddenError("Token CSRF inválido ou ausente")
            }

            const authenticatedReq = req as AuthenticatedRequest
            // `role` sempre vem do banco (storedToken.user.role), nunca do
            // payload do JWT — garante efeito imediato de promoção/rebaixamento.
            authenticatedReq.user = { ...payload, role: storedToken.user.role }
            authenticatedReq.authSource = authSource
            authenticatedReq.authToken = token
            next()
        } catch (error) {
            if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
                next(error)
            } else {
                next(new UnauthorizedError("Token inválido ou expirado"))
            }
        }
    }
}