import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { MeterReadingController } from "@/modules/meter/meter-reading.controller.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterReadingService } from "@/modules/meter/meter-reading.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"

// Rota top-level: /api/meter-readings — leituras agregadas por minuto/hora
// via MeterReading, pro gráfico "ao vivo". Alvo por query param
// (targetType/targetId), mesmo padrão de /api/consumption e /api/meters.
export function meterReadingRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const meterReadingRepository = new MeterReadingRepository(prismaClient)
    const meterRepository = new MeterRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)

    const meterReadingService = new MeterReadingService(
        meterReadingRepository,
        meterRepository,
        propertyRepository,
        areaRepository,
        deviceRepository,
    )
    const controller = new MeterReadingController(meterReadingService)

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))

    return router
}
