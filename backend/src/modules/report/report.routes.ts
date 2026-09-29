import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ReportController } from "@/modules/report/report.controller.js"
import { ReportRepository } from "@/modules/report/report.repository.js"
import { ReportService } from "@/modules/report/report.service.js"
import { createConsumptionService } from "@/modules/consumption/consumption.routes.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

/**
 * Monta o serviço de relatórios com as dependências de persistência. Fica
 * fora da rota porque o envio agendado usa o mesmo serviço.
 *
 * @param prismaClient - Cliente Prisma do processo.
 */
export function createReportService(prismaClient: PrismaClient): ReportService {
    return new ReportService(
        new ReportRepository(prismaClient),
        new ConsumptionRepository(prismaClient),
        createConsumptionService(prismaClient),
        new MeterRepository(prismaClient),
        new PropertyRepository(prismaClient),
        new AreaRepository(prismaClient),
        new DeviceRepository(prismaClient),
        new DistributorRepository(prismaClient),
    )
}

// Rota top-level: /api/reports — emissão sob demanda, histórico, download e exclusão. O alvo
// (targetType/targetId) vem no corpo do pedido, igual às demais rotas de
// medição; o `id` só existe no download.
export function reportRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    auditService: AuditService,
): Router {
    const router = Router()

    const controller = new ReportController(createReportService(prismaClient), auditService)

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))
    router.post("/", authenticate, (req, res, next) => controller.generate(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => controller.remove(req, res, next))
    router.get("/:id/download", authenticate, (req, res, next) =>
        controller.download(req, res, next),
    )

    return router
}
