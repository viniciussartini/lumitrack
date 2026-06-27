import type { Request, Response, NextFunction } from "express"
import type { AuthService } from "@/modules/auth/auth.service.js"
import type { UserService } from "@/modules/user/user.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"
import { UnauthorizedError } from "@/shared/errors/AppError.js"
import { env } from "@/config/env.js"
import { parseJwtExpiry } from "@/shared/time/parseJwtExpiry.js"
import {
    generateCsrfToken,
    getAuthCookieOptions,
    getCsrfCookieOptions,
} from "@/shared/security/csrf.js"

export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly auditService: AuditService,
    ) {}

    // POST /api/auth/login — Público
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token, channel, userId } = await this.authService.login(req.body)

            await this.auditService.record({
                userId,
                action: "LOGIN",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                metadata: { channel },
                ...getRequestContext(req),
            })

            if (channel === "WEB") {
                const maxAge = parseJwtExpiry(env.JWT_WEB_EXPIRES_IN)

                res.cookie(env.AUTH_COOKIE_NAME, token, getAuthCookieOptions(env.NODE_ENV, maxAge))
                res.cookie(
                    env.CSRF_COOKIE_NAME,
                    generateCsrfToken(),
                    getCsrfCookieOptions(env.NODE_ENV, maxAge),
                )

                // O JWT nunca entra no body para WEB — ele só viaja pelo
                // cookie httpOnly. Incluí-lo aqui anularia a proteção contra
                // roubo de sessão via XSS que é o objetivo desta mudança.
                res.status(200).json({ status: "success", data: {} })
                return
            }

            // MOBILE — comportamento inalterado.
            res.status(200).json({ status: "success", data: { token } })
        } catch (error) {
            // Só audita credenciais inválidas — não um corpo malformado
            // (ValidationError), que não é uma tentativa de login real.
            if (error instanceof UnauthorizedError) {
                const attemptedEmail = (req.body as { email?: unknown })?.email
                await this.auditService.record({
                    userId: null,
                    action: "LOGIN",
                    outcome: "FAILURE",
                    resourceType: "User",
                    metadata: {
                        attemptedEmail: typeof attemptedEmail === "string" ? attemptedEmail : null,
                    },
                    ...getRequestContext(req),
                })
            }
            next(error)
        }
    }

    // GET /api/auth/me — Protegido
    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = (req as AuthenticatedRequest).user
            const user = await this.userService.findById(id)

            res.status(200).json({ status: "success", data: user })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/logout — Protegido
    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { authToken, authSource, user } = req as AuthenticatedRequest
            await this.authService.logout(authToken)

            await this.auditService.record({
                userId: user.id,
                action: "LOGOUT",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: user.id,
                ...getRequestContext(req),
            })

            if (authSource === "cookie") {
                // `clearCookie` exige os mesmos atributos usados em `res.cookie`
                // (path/secure/sameSite) — senão o browser ignora a remoção.
                // `maxAge` é irrelevante aqui (o Express já sobrescreve com
                // uma data expirada), por isso usamos 0.
                res.clearCookie(env.AUTH_COOKIE_NAME, getAuthCookieOptions(env.NODE_ENV, 0))
                res.clearCookie(env.CSRF_COOKIE_NAME, getCsrfCookieOptions(env.NODE_ENV, 0))
            }

            res.status(200).json({ status: "success", message: "Logout realizado com sucesso" })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/forgot-password — Público
    async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await this.authService.forgotPassword(req.body)

            res.status(200).json({
                status: "success",
                message: "Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.",
            })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/reset-password — Público
    async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await this.authService.resetPassword(req.body)
            
            res.status(200).json({
                status: "success",
                message: "Senha redefinida com sucesso",
            })
        } catch (error) {
            next(error)
        }
    }
}