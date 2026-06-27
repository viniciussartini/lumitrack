import type { Request, Response, NextFunction } from "express"
import type { AuthService } from "@/modules/auth/auth.service.js"
import type { UserService } from "@/modules/user/user.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
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
    ) {}

    // POST /api/auth/login — Público
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token, channel } = await this.authService.login(req.body)

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
            const { authToken, authSource } = req as AuthenticatedRequest
            await this.authService.logout(authToken)

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