import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { MeterController } from "@/modules/meter/meter.controller.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { MeterService } from "@/modules/meter/meter.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/meters — medidor é um recurso independente,
// vinculável a Property, Area ou Device (não aninhado sob nenhum deles).
// Montada diretamente no app.ts.
export function meterRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const meterRepository = new MeterRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)
    const meterService = new MeterService(
        meterRepository,
        propertyRepository,
        areaRepository,
        deviceRepository,
    )
    const controller = new MeterController(meterService)

    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    // "/by-target" precisa vir ANTES de "/:id" — senão o Express casaria
    // "by-target" como se fosse o valor do param :id.
    router.get("/by-target", authenticate, (req, res, next) =>
        controller.findByTarget(req, res, next),
    )

    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.delete(req, res, next),
    )

    return router
}
