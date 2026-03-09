import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { IoTController } from "@/modules/iot/iot.controller.js"
import { IoTRepository } from "@/modules/iot/iot.repository.js"
import { IoTService } from "@/modules/iot/iot.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"

function buildController(prismaClient: PrismaClient): IoTController {
    const iotRepository      = new IoTRepository(prismaClient)
    const deviceRepository   = new DeviceRepository(prismaClient)
    const areaRepository     = new AreaRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)

    const iotService = new IoTService(
        iotRepository,
        deviceRepository,
        areaRepository,
        propertyRepository,
    )

    return new IoTController(iotService)
}

// Rota aninhada sob device:
// /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config
//
// Montada em device.routes.ts como:
// router.use("/:deviceId/iot-config", iotRoutes(authenticate, prismaClient))
//
// mergeParams: true é essencial — sem ele, req.params.propertyId,
// req.params.areaId e req.params.deviceId seriam undefined no controller.
export function iotRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router     = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    // Como IoTDeviceConfig é um recurso singleton por device (deviceId @unique),
    // não há /:id nas rotas — o deviceId vindo do path pai já é o identificador único.
    router.post("/", authenticate, (req, res, next) => controller.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findByDeviceId(req, res, next))
    router.put("/", authenticate, (req, res, next) => controller.update(req, res, next))
    router.delete("/", authenticate, (req, res, next) => controller.delete(req, res, next))

    return router
}