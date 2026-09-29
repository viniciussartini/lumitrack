import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ConsumptionController } from "@/modules/consumption/consumption.controller.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { PldQuoteRepository } from "@/modules/pld-quote/pld-quote.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"

/**
 * Monta o `ConsumptionService` com todas as suas dependências de repositório —
 * compartilhado com o módulo de relatórios, que reaproveita o custo mensal.
 *
 * @param prismaClient - Cliente Prisma do processo.
 */
export function createConsumptionService(prismaClient: PrismaClient): ConsumptionService {
    return new ConsumptionService(
        new ConsumptionRepository(prismaClient),
        new MeterRepository(prismaClient),
        new PropertyRepository(prismaClient),
        new AreaRepository(prismaClient),
        new DeviceRepository(prismaClient),
        new DistributorRepository(prismaClient),
        new TariffFlagRepository(prismaClient),
        new TariffCatalogRepository(prismaClient),
        new MeterDemandRollupRepository(prismaClient),
        new AclContractRepository(prismaClient),
        new PldQuoteRepository(prismaClient),
    )
}

// Rota top-level: /api/consumption — consumo agregado via MeterReading,
// somente leitura. Não aninhada sob property/area/device porque o alvo é
// escolhido por query param (targetType/targetId), igual a /api/meters.
export function consumptionRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const consumptionService = createConsumptionService(prismaClient)
    const controller = new ConsumptionController(consumptionService)

    // "/summary", "/acl-comparison" e "/branca-comparison" precisam vir
    // ANTES de "/" só por consistência de leitura com as outras rotas do
    // módulo — não há conflito real aqui (não existe "/:id" em
    // /api/consumption, o alvo sempre chega por query param).
    router.get("/summary", authenticate, (req, res, next) => controller.summary(req, res, next))
    router.get("/acl-comparison", authenticate, (req, res, next) =>
        controller.compareAclToAcr(req, res, next),
    )
    router.get("/branca-comparison", authenticate, (req, res, next) =>
        controller.compareBrancaToConvencional(req, res, next),
    )
    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))

    return router
}
