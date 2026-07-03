import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AdminController } from "@/modules/admin/admin.controller.js"
import { AdminService } from "@/modules/admin/admin.service.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { requireRole } from "@/shared/middlewares/requireRole.js"
import type { AuditService } from "@/shared/audit/audit.service.js"

// Módulo dedicado (mesmo precedente de modules/export/) — único endpoint,
// gated apenas por role (sem :id na URL, sem checagem de ownership: um
// admin tem acesso global ao audit log por design). Registrado sob
// /api/admin em app.ts.
export function adminRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    auditService: AuditService,
): Router {
    const router = Router()

    const adminService = new AdminService(new AuditRepository(prismaClient))
    const adminController = new AdminController(adminService, auditService)

    router.get("/audit-logs", authenticate, requireRole("ADMIN"), (req, res, next) =>
        adminController.listAuditLogs(req, res, next),
    )

    return router
}
