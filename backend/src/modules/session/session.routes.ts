import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { SessionController } from "@/modules/session/session.controller.js"
import { SessionRepository } from "@/modules/session/session.repository.js"
import { SessionService } from "@/modules/session/session.service.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/sessions — sessões ativas da conta (web e mobile). O
// encerramento passa por `blockDemoWrite`: a conta de demonstração é
// compartilhada, então não pode encerrar sessões de outros visitantes.
export function sessionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    auditService: AuditService,
): Router {
    const router = Router()
    const controller = new SessionController(
        new SessionService(new SessionRepository(prismaClient)),
        auditService,
    )

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))
    router.post("/revoke-others", authenticate, blockDemoWrite, (req, res, next) =>
        controller.revokeOthers(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.revoke(req, res, next),
    )

    return router
}
