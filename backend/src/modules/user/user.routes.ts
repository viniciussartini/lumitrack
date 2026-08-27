import { Router } from "express"
import type { RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { env } from "@/config/env.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import {
    EmailChangeService,
    type SendEmailChangeConfirmationFn,
    type SendEmailChangedNoticeFn,
} from "@/modules/auth/email-change.service.js"
import { UserController } from "@/modules/user/user.controller.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

export function userRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    sendEmailChangeConfirmation: SendEmailChangeConfirmationFn,
    sendEmailChangedNotice: SendEmailChangedNoticeFn,
    auditService: AuditService,
): Router {
    const router = Router()

    // EmailChangeService próprio deste router — cada composition root monta
    // o que precisa, mesmo padrão já usado por auth.routes.ts para
    // UserRepository/UserService.
    const authRepository = new AuthRepository(prismaClient)
    const emailChangeService = new EmailChangeService(
        authRepository,
        sendEmailChangeConfirmation,
        sendEmailChangedNotice,
    )
    const userRepository = new UserRepository(prismaClient)
    const userService = new UserService(userRepository, env.REGISTRATION_ENABLED, (params) =>
        emailChangeService.requestChange(params),
    )
    const userController = new UserController(userService, auditService)

    // Rotas públicas
    // Cadastro de novo usuário — não exige autenticação.
    router.post("/", (req, res, next) => userController.create(req, res, next))

    // Rotas protegidas
    // O middleware `authenticate` é aplicado individualmente em cada rota protegida.
    router.get("/:id", authenticate, (req, res, next) => userController.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => userController.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => userController.delete(req, res, next))

    return router
}
