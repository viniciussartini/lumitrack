import type { Request, Response, NextFunction } from "express"
import type { AuthService } from "@/modules/auth/auth.service.js"
import type { UserService } from "@/modules/user/user.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"
import { UnauthorizedError } from "@/shared/errors/AppError.js"
import { env } from "@/config/env.js"
import { generateBlindIndex } from "@/shared/crypto/blindIndex.js"
import { parseJwtExpiry } from "@/shared/time/parseJwtExpiry.js"
import {
    generateCsrfToken,
    getAuthCookieOptions,
    getCsrfCookieOptions,
    getRefreshCookieOptions,
    getRefreshCsrfCookieOptions,
    validateCsrf,
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
            const result = await this.authService.login(req.body)

            if (result.mfaRequired) {
                // Senha já validada, mas a sessão real ainda não existe —
                // não audita LOGIN aqui (só quando a sessão é de fato
                // estabelecida, em completeMfaLogin ou abaixo).
                res.status(200).json({
                    status: "success",
                    data: { mfaRequired: true, mfaToken: result.mfaToken },
                })
                return
            }

            const { token, refreshToken, channel, userId } = result

            await this.auditService.record({
                userId,
                action: "LOGIN",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                metadata: { channel },
                ...getRequestContext(req),
            })

            this.respondWithSession(res, channel, token, refreshToken)
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
                        // Blind index (não o e-mail em claro — #10, A09/LGPD
                        // Art. 6º III/VII): preserva a correlação entre
                        // tentativas contra o mesmo alvo, inclusive de quem
                        // não é titular, sem reter o dado pessoal em si.
                        attemptedEmailHash:
                            typeof attemptedEmail === "string"
                                ? generateBlindIndex(attemptedEmail)
                                : null,
                    },
                    ...getRequestContext(req),
                })
            }
            next(error)
        }
    }

    // POST /api/auth/login/mfa — Público (mas exige mfaToken válido)
    // Segunda etapa do login quando a conta tem MFA habilitado.
    async verifyMfaLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token, refreshToken, channel, userId } =
                await this.authService.completeMfaLogin(req.body)

            await this.auditService.record({
                userId,
                action: "LOGIN",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                metadata: { channel, mfa: true },
                ...getRequestContext(req),
            })

            this.respondWithSession(res, channel, token, refreshToken)
        } catch (error) {
            if (error instanceof UnauthorizedError) {
                await this.auditService.record({
                    userId: null,
                    action: "LOGIN",
                    outcome: "FAILURE",
                    resourceType: "User",
                    metadata: { mfaStep: true },
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
            const rawRefreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined
            await this.authService.logout(authToken, rawRefreshToken)

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
                res.clearCookie(env.AUTH_COOKIE_NAME, getAuthCookieOptions(env.NODE_ENV, 0))
                res.clearCookie(env.CSRF_COOKIE_NAME, getCsrfCookieOptions(env.NODE_ENV, 0))
                res.clearCookie(env.REFRESH_COOKIE_NAME, getRefreshCookieOptions(env.NODE_ENV, 0))
                res.clearCookie(
                    env.REFRESH_CSRF_COOKIE_NAME,
                    getRefreshCsrfCookieOptions(env.NODE_ENV, 0),
                )
            }

            res.status(200).json({ status: "success", message: "Logout realizado com sucesso" })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/refresh — Público (JWT pode estar expirado)
    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const rawRefreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined

            if (!rawRefreshToken) {
                throw new UnauthorizedError("Refresh token ausente")
            }

            const csrfCookie = req.cookies?.[env.REFRESH_CSRF_COOKIE_NAME] as string | undefined
            const csrfHeader = req.headers[env.REFRESH_CSRF_HEADER_NAME] as string | undefined

            if (!validateCsrf(csrfCookie, csrfHeader)) {
                // Limpa cookies inválidos antes de rejeitar — evita retry inútil.
                this.clearAllCookies(res)
                throw new UnauthorizedError("Token CSRF de refresh inválido")
            }

            const { token, refreshToken, channel, userId } = await this.authService.refresh(
                rawRefreshToken,
                async (affectedUserId) => {
                    await this.auditService.record({
                        userId: affectedUserId,
                        action: "REFRESH_TOKEN_REUSE_DETECTED",
                        outcome: "FAILURE",
                        resourceType: "User",
                        resourceId: affectedUserId,
                        ...getRequestContext(req),
                    })
                },
            )

            await this.auditService.record({
                userId,
                action: "LOGIN",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                metadata: { channel, refreshed: true },
                ...getRequestContext(req),
            })

            this.respondWithSession(res, channel, token, refreshToken)
        } catch (error) {
            // Em qualquer falha de refresh, limpa todos os cookies para forçar
            // novo login — evita loop de retentativas fadadas no frontend.
            this.clearAllCookies(res)
            next(error)
        }
    }

    // POST /api/auth/forgot-password — Público
    async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await this.authService.forgotPassword(req.body)

            res.status(200).json({
                status: "success",
                message:
                    "Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.",
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

    // POST /api/auth/mfa/setup — Protegido
    // Gera um secret+QR novo — nada é persistido até verifyMfaSetup().
    async setupMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email } = (req as AuthenticatedRequest).user
            const result = await this.authService.setupMfa(email)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/mfa/verify-setup — Protegido
    async verifyMfaSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.authService.verifyMfaSetup(userId, req.body)

            await this.auditService.record({
                userId,
                action: "MFA_ENABLED",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                ...getRequestContext(req),
            })

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/mfa/disable — Protegido
    async disableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.authService.disableMfa(userId, req.body)

            await this.auditService.record({
                userId,
                action: "MFA_DISABLED",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                ...getRequestContext(req),
            })

            res.status(200).json({ status: "success", message: "MFA desabilitado com sucesso" })
        } catch (error) {
            next(error)
        }
    }

    // ─── Helpers privados ─────────────────────────────────────────────────────

    private respondWithSession(
        res: Response,
        channel: "WEB" | "MOBILE",
        token: string,
        refreshToken: string | null,
    ): void {
        if (channel === "WEB") {
            const sessionMaxAge = parseJwtExpiry(env.JWT_WEB_EXPIRES_IN)
            const refreshMaxAge = parseJwtExpiry(env.JWT_REFRESH_EXPIRES_IN)

            res.cookie(
                env.AUTH_COOKIE_NAME,
                token,
                getAuthCookieOptions(env.NODE_ENV, sessionMaxAge),
            )
            res.cookie(
                env.CSRF_COOKIE_NAME,
                generateCsrfToken(),
                getCsrfCookieOptions(env.NODE_ENV, sessionMaxAge),
            )

            if (refreshToken) {
                res.cookie(
                    env.REFRESH_COOKIE_NAME,
                    refreshToken,
                    getRefreshCookieOptions(env.NODE_ENV, refreshMaxAge),
                )
                res.cookie(
                    env.REFRESH_CSRF_COOKIE_NAME,
                    generateCsrfToken(),
                    getRefreshCsrfCookieOptions(env.NODE_ENV, refreshMaxAge),
                )
            }

            // O JWT nunca entra no body para WEB — ele só viaja pelo
            // cookie httpOnly.
            res.status(200).json({ status: "success", data: {} })
            return
        }

        // MOBILE — comportamento inalterado.
        res.status(200).json({ status: "success", data: { token } })
    }

    private clearAllCookies(res: Response): void {
        res.clearCookie(env.AUTH_COOKIE_NAME, getAuthCookieOptions(env.NODE_ENV, 0))
        res.clearCookie(env.CSRF_COOKIE_NAME, getCsrfCookieOptions(env.NODE_ENV, 0))
        res.clearCookie(env.REFRESH_COOKIE_NAME, getRefreshCookieOptions(env.NODE_ENV, 0))
        res.clearCookie(env.REFRESH_CSRF_COOKIE_NAME, getRefreshCsrfCookieOptions(env.NODE_ENV, 0))
    }
}
