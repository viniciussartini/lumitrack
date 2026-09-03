import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ConsumptionController } from "@/modules/consumption/consumption.controller.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"

// Rota top-level: /api/consumption — consumo agregado via MeterReading,
// somente leitura. Não aninhada sob property/area/device porque o alvo é
// escolhido por query param (targetType/targetId), igual a /api/meters.
export function consumptionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const consumptionRepository = new ConsumptionRepository(prismaClient)
    const meterRepository = new MeterRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)
    const distributorRepository = new DistributorRepository(prismaClient)
    const tariffFlagRepository = new TariffFlagRepository(prismaClient)

    const consumptionService = new ConsumptionService(
        consumptionRepository,
        meterRepository,
        propertyRepository,
        areaRepository,
        deviceRepository,
        distributorRepository,
        tariffFlagRepository,
    )
    const controller = new ConsumptionController(consumptionService)

    // "/summary" precisa vir ANTES de "/" só por consistência de leitura com
    // as outras rotas do módulo — não há conflito real aqui (não existe
    // "/:id" em /api/consumption, o alvo sempre chega por query param).
    router.get("/summary", authenticate, (req, res, next) => controller.summary(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))

    return router
}
