import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { DemandAlertController } from "@/modules/demand-alert/demand-alert.controller.js"
import { DemandAlertRepository } from "@/modules/demand-alert/demand-alert.repository.js"
import { DemandAlertService } from "@/modules/demand-alert/demand-alert.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/demand-alerts — mesma convenção de /api/alerts
// (recurso independente vinculado a um medidor via meterId no corpo da
// criação, não aninhado sob property/area/device).
export function demandAlertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const demandAlertRepository = new DemandAlertRepository(prismaClient)
    const meterRepository = new MeterRepository(prismaClient)
    const demandAlertService = new DemandAlertService(demandAlertRepository, meterRepository)
    const controller = new DemandAlertController(demandAlertService)

    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.patch("/:id/enabled", authenticate, blockDemoWrite, (req, res, next) =>
        controller.patchEnabled(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.delete(req, res, next),
    )

    return router
}
