import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { ExportController } from "@/modules/export/export.controller.js"
import { ExportService } from "@/modules/export/export.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

// Módulo dedicado (não inline em user.routes.ts) — o ExportService orquestra
// 8 repositórios já existentes, volume bem maior que o resto de
// user.routes.ts (que só depende de UserRepository). Registrado sob o mesmo
// prefixo /api/users em app.ts.
export function exportRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    auditService: AuditService,
): Router {
    const router = Router()

    const exportService = new ExportService(
        new UserRepository(prismaClient),
        new PropertyRepository(prismaClient),
        new DistributorRepository(prismaClient),
        new AlertRepository(prismaClient),
        new AreaRepository(prismaClient),
        new DeviceRepository(prismaClient),
        new AuditRepository(prismaClient),
    )
    const exportController = new ExportController(exportService, auditService)

    // Sem :id na URL — userId vem sempre do middleware authenticate, igual
    // ao precedente de GET /api/auth/me (#06). Elimina de raiz qualquer
    // risco de ownership incorreto.
    router.get("/me/data-export", authenticate, (req, res, next) =>
        exportController.export(req, res, next),
    )

    return router
}
