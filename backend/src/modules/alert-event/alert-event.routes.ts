import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AlertEventController } from "@/modules/alert-event/alert-event.controller.js"
import { AlertEventService } from "@/modules/alert-event/alert-event.service.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"

// Rota top-level: /api/alert-events — histórico de episódios de disparo,
// somente leitura. Não aninhada sob /api/alerts/:id porque o filtro é por
// query param (alertId), igual a /api/consumption.
export function alertEventRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const alertTriggerEventRepository = new AlertTriggerEventRepository(prismaClient)
    const alertRepository = new AlertRepository(prismaClient)
    const alertEventService = new AlertEventService(alertTriggerEventRepository, alertRepository)
    const controller = new AlertEventController(alertEventService)

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))

    return router
}
