import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { env } from "@/config/env.js"
import { AuthController } from "@/modules/auth/auth.controller.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuthService, type SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import {
    EmailChangeService,
    type SendEmailChangeConfirmationFn,
    type SendEmailChangedNoticeFn,
} from "@/modules/auth/email-change.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

export function authRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    sendPasswordResetEmail: SendPasswordResetEmailFn,
    sendEmailChangeConfirmation: SendEmailChangeConfirmationFn,
    sendEmailChangedNotice: SendEmailChangedNoticeFn,
    auditService: AuditService,
): Router {
    const router = Router()
    const authRepository = new AuthRepository(prismaClient)
    const authService = new AuthService(
        authRepository,
        sendPasswordResetEmail,
        env.DEMO_LOGIN_ENABLED,
    )
    const emailChangeService = new EmailChangeService(
        authRepository,
        sendEmailChangeConfirmation,
        sendEmailChangedNotice,
    )
    const userRepository = new UserRepository(prismaClient)
    const userService = new UserService(userRepository)
    const authController = new AuthController(
        authService,
        userService,
        auditService,
        emailChangeService,
    )

    // Rotas públicas
    router.post("/login", (req, res, next) => authController.login(req, res, next))
    // Login de demonstração sem senha — gated por DEMO_LOGIN_ENABLED no
    // service (issue #179). Rota sempre montada; o gate decide se funciona.
    router.post("/demo-login", (req, res, next) => authController.demoLogin(req, res, next))
    // Segunda etapa do login quando a conta tem MFA habilitado — pública,
    // mas só aceita um mfaToken de curta duração emitido por /login.
    router.post("/login/mfa", (req, res, next) => authController.verifyMfaLogin(req, res, next))
    // Renovação de sessão WEB via refresh token httpOnly.
    // Não passa pelo middleware `authenticate` — o JWT pode estar expirado,
    // que é exatamente o cenário que motiva o refresh.
    router.post("/refresh", (req, res, next) => authController.refresh(req, res, next))
    router.post("/forgot-password", (req, res, next) =>
        authController.forgotPassword(req, res, next),
    )
    router.post("/reset-password", (req, res, next) => authController.resetPassword(req, res, next))
    // Efetiva a troca de e-mail pedida via PUT /api/users/:id (issue #178) —
    // pública, mas só aceita um token de confirmação válido.
    router.post("/confirm-email-change", (req, res, next) =>
        authController.confirmEmailChange(req, res, next),
    )

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
