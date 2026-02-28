import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { DeviceController } from "@/modules/device/device.controller.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { deviceConsumptionRoutes } from "@/modules/consumption/consumption.routes.js"


export function deviceRoutes(authenticate: RequestHandler, prismaClient: PrismaClient,

): Router {

    // Montado em area.routes.ts como:
    //   router.use("/:areaId/devices", deviceRoutes(authenticate, prismaClient))
    //
    // A cadeia de mergeParams propaga os params de todos os níveis pai:
    //   app → /api/properties/:propertyId  (property.routes)
    //       → /areas/:areaId               (area.routes, mergeParams: true)
    //       → /devices/:id                 (device.routes, mergeParams: true)
    //
    // Sem mergeParams em cada nível, req.params.propertyId e req.params.areaId
    // seriam undefined no controller de device.
    const router = Router({ mergeParams: true })

    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)
    const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)
    const deviceController = new DeviceController(deviceService)

    router.use("/:deviceId/consumption", deviceConsumptionRoutes(authenticate, prismaClient))

    router.post("/", authenticate, (req, res, next) => deviceController.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => deviceController.findAll(req, res, next))
    router.get("/:id", authenticate, (req, res, next) => deviceController.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => deviceController.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => deviceController.delete(req, res, next))

    return router
}