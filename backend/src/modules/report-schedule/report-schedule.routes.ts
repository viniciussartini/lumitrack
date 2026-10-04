import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ReportScheduleController } from "@/modules/report-schedule/report-schedule.controller.js"
import { ReportScheduleRepository } from "@/modules/report-schedule/report-schedule.repository.js"
import { ReportScheduleService } from "@/modules/report-schedule/report-schedule.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/report-schedules — configurações de envio automático
// de relatório. As escritas guardam e-mails digitados pelo usuário (podem ser
// de terceiros), então contas de demonstração, que não podem receber dado real,
// só leem.
export function reportScheduleRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const service = new ReportScheduleService(
        new ReportScheduleRepository(prismaClient),
        new MeterRepository(prismaClient),
        new PropertyRepository(prismaClient),
        new AreaRepository(prismaClient),
        new DeviceRepository(prismaClient),
    )
    const controller = new ReportScheduleController(service)

    router.get("/", authenticate, (req, res, next) => controller.list(req, res, next))
    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.remove(req, res, next),
    )

    return router
}
