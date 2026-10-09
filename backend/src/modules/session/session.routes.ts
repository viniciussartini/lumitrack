import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { SessionController } from "@/modules/session/session.controller.js"
import { SessionRepository } from "@/modules/session/session.repository.js"
import { SessionService } from "@/modules/session/session.service.js"

// Rota top-level: /api/sessions — sessões ativas da conta (web e mobile).
export function sessionRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()
    const controller = new SessionController(
        new SessionService(new SessionRepository(prismaClient)),
    )

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))

    return router
}
