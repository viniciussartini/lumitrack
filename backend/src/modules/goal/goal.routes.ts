import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { GoalController } from "@/modules/goal/goal.controller.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { GoalService } from "@/modules/goal/goal.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/goals — metas anuais de consumo por propriedade. As
// escritas passam por `blockDemoWrite`: contas de demonstração só leem.
export function goalRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const service = new GoalService(
        new GoalRepository(prismaClient),
        new PropertyRepository(prismaClient),
    )
    const controller = new GoalController(service)

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))
    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.remove(req, res, next),
    )

    return router
}
