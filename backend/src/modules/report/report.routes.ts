import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ReportController } from "@/modules/report/report.controller.js"
import { ReportService } from "@/modules/report/report.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"

function buildController(prismaClient: PrismaClient): ReportController {
    const consumptionRepository = new ConsumptionRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)

    const reportService = new ReportService(
        consumptionRepository,
        propertyRepository,
        areaRepository,
        deviceRepository,
    )

    return new ReportController(reportService)
}

// Montado em property.routes.ts como:
//   router.use("/:propertyId/report", reportRoutes(authenticate, prismaClient))
//
// O mergeParams: true garante que :propertyId definido no router pai
// esteja disponível em req.params dentro deste router.
export function reportRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    // Único endpoint do módulo — todo o contexto chega via query params.
    // GET /api/properties/:propertyId/report?target=PROPERTY&period=MONTHLY
    // GET /api/properties/:propertyId/report?target=AREA&targetId=<uuid>&period=MONTHLY
    // GET /api/properties/:propertyId/report?target=DEVICE&targetId=<uuid>&targetAreaId=<uuid>&period=DAILY
    router.get("/", authenticate, (req, res, next) => controller.generate(req, res, next))

    return router
}