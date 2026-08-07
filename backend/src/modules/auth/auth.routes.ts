import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AuthController } from "@/modules/auth/auth.controller.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuthService, type SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

export function authRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    sendPasswordResetEmail: SendPasswordResetEmailFn,
    auditService: AuditService,
): Router {
    const router = Router()
    const authRepository = new AuthRepository(prismaClient)
    const authService = new AuthService(authRepository, sendPasswordResetEmail)
    const userRepository = new UserRepository(prismaClient)
    const userService = new UserService(userRepository)
    const authController = new AuthController(authService, userService, auditService)

    // Rotas públicas
    router.post("/login", (req, res, next) => authController.login(req, res, next))
    // Segunda etapa do login quando a conta tem MFA habilitado — pública,
    // mas só aceita um mfaToken de curta duração emitido por /login.
    router.post("/login/mfa", (req, res, next) => authController.verifyMfaLogin(req, res, next))
    // Renovação de sessão WEB via refresh token httpOnly (#14 — A06).
    // Não passa pelo middleware `authenticate` — o JWT pode estar expirado,
    // que é exatamente o cenário que motiva o refresh.
    router.post("/refresh", (req, res, next) => authController.refresh(req, res, next))
    router.post("/forgot-password", (req, res, next) =>
        authController.forgotPassword(req, res, next),
    )
    router.post("/reset-password", (req, res, next) => authController.resetPassword(req, res, next))

    // Rotas protegidas — exigem autenticação
    router.get("/me", authenticate, (req, res, next) => authController.me(req, res, next))
    router.post("/logout", authenticate, (req, res, next) => authController.logout(req, res, next))
    router.post("/mfa/setup", authenticate, (req, res, next) =>
        authController.setupMfa(req, res, next),
    )
    router.post("/mfa/verify-setup", authenticate, (req, res, next) =>
        authController.verifyMfaSetup(req, res, next),
    )
    router.post("/mfa/disable", authenticate, (req, res, next) =>
        authController.disableMfa(req, res, next),
    )

    return router
}
