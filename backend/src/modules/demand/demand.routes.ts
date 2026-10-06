import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { DemandController } from "@/modules/demand/demand.controller.js"
import { DemandOverviewService } from "@/modules/demand/demand.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"

// Rota top-level: /api/demand — leitura da demanda medida contra a contratada
// do Grupo A. Só leitura, então não há `blockDemoWrite`.
export function demandRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const controller = new DemandController(
        new DemandOverviewService(
            new PropertyRepository(prismaClient),
            new MeterRepository(prismaClient),
            new DistributorRepository(prismaClient),
            new MeterReadingRepository(prismaClient),
            new MeterDemandRollupRepository(prismaClient),
        ),
    )

    router.get("/overview", authenticate, (req, res, next) => controller.overview(req, res, next))

    return router
}
