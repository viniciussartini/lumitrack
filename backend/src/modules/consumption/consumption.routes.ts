import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ConsumptionController } from "@/modules/consumption/consumption.controller.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"

// Fábrica compartilhada — instancia o service uma única vez,
// independente do target (property, area ou device).
function buildController(prismaClient: PrismaClient): ConsumptionController {
    const consumptionRepository = new ConsumptionRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)
    const distributorRepository = new DistributorRepository(prismaClient)

    const consumptionService = new ConsumptionService(
        consumptionRepository,
        propertyRepository,
        areaRepository,
        deviceRepository,
        distributorRepository,
    )

    return new ConsumptionController(consumptionService)
}

// Router: PROPERTY 
// Montado em property.routes como:
// router.use("/:propertyId/consumption", propertyConsumptionRoutes(...))
export function propertyConsumptionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForProperty(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForProperty(req, res, next))
    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => controller.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => controller.delete(req, res, next))

    return router
}

// Router: AREA 
// Montado em area.routes como:
// router.use("/:areaId/consumption", areaConsumptionRoutes(...))
export function areaConsumptionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForArea(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForArea(req, res, next))

    return router
}

// Router: target DEVICE 
// Montado em device.routes como:
// router.use("/:deviceId/consumption", deviceConsumptionRoutes(...))
export function deviceConsumptionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForDevice(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForDevice(req, res, next))

    return router
}