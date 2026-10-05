import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { createConsumptionService } from "@/modules/consumption/consumption.routes.js"
import { GoalAlertController } from "@/modules/goal/goal-alert.controller.js"
import { GoalAlertService } from "@/modules/goal/goal-alert.service.js"
import { GoalConsumptionReader } from "@/modules/goal/goal-consumption.js"
import { GoalController } from "@/modules/goal/goal.controller.js"
import { GoalProgressController } from "@/modules/goal/goal-progress.controller.js"
import { GoalProgressService } from "@/modules/goal/goal-progress.service.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { GoalService } from "@/modules/goal/goal.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/goals — metas anuais de consumo por propriedade. As
// escritas passam por `blockDemoWrite`: contas de demonstração só leem.
export function goalRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const consumptionReader = new GoalConsumptionReader(
        new MeterRepository(prismaClient),
        new ConsumptionRepository(prismaClient),
        createConsumptionService(prismaClient),
    )
    const service = new GoalService(
        new GoalRepository(prismaClient),
        new PropertyRepository(prismaClient),
    )
    const controller = new GoalController(service)
    const progressController = new GoalProgressController(
        new GoalProgressService(new GoalRepository(prismaClient), consumptionReader),
    )
    const alertController = new GoalAlertController(
        new GoalAlertService(new GoalRepository(prismaClient), consumptionReader),
    )

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))
    router.get("/progress", authenticate, (req, res, next) =>
        progressController.list(req, res, next),
    )
    router.get("/alerts", authenticate, (req, res, next) => alertController.list(req, res, next))
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
