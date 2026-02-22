import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { env } from "@/config/env.js"
import { UnauthorizedError } from "@/shared/errors/AppError.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { PrismaClient } from "@/generated/prisma/client.js"

// Extendemos o tipo Request do Express para incluir o usuário autenticado.
// Isso evita usar `any` e mantém a tipagem segura em todos os controllers.
export interface AuthenticatedRequest extends Request {
    user: {
        id: string
        email: string
        userType: string
    }
}

export function createAuthenticateMiddleware(prisma: PrismaClient) {
    const authRepository = new AuthRepository(prisma)

    return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
        try {
            const authHeader = req.headers.authorization

            if (!authHeader?.startsWith("Bearer ")) {
                throw new UnauthorizedError("Token não fornecido")
            }

            const token = authHeader.split(" ")[1]

            if (!token) {
                throw new UnauthorizedError("Token malformado")
            }

            const payload = jwt.verify(token, env.JWT_SECRET) as AuthenticatedRequest["user"]
            const storedToken = await authRepository.findActiveToken(token)

            if (!storedToken) {
                throw new UnauthorizedError("Token inválido")
            }

            if (storedToken.revokedAt !== null) {
                throw new UnauthorizedError("Token revogado")
            }

            if (storedToken.expiresAt !== null && storedToken.expiresAt < new Date()) {
                throw new UnauthorizedError("Token expirado")
            }

            ;(req as AuthenticatedRequest).user = payload
            next()
        } catch (error) {
            if (error instanceof UnauthorizedError) {
                next(error)
            } else {
                next(new UnauthorizedError("Token inválido ou expirado"))
            }
        }
    }
}