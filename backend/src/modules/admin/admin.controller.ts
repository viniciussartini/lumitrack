import type { Request, Response, NextFunction } from "express"
import type { AdminService } from "@/modules/admin/admin.service.js"
import { auditLogQuerySchema } from "@/modules/admin/admin.schema.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"
import { ValidationError } from "@/shared/errors/AppError.js"

export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly auditService: AuditService,
    ) {}

    // GET /api/admin/audit-logs — Autenticado + requireRole("ADMIN")
    async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const parsed = auditLogQuerySchema.safeParse(req.query)
            if (!parsed.success) {
                throw new ValidationError("Parâmetros de consulta inválidos")
            }
            const query = parsed.data

            const { id: adminUserId } = (req as AuthenticatedRequest).user
            const result = await this.adminService.listAuditLogs(query)

            res.status(200).json({ status: "success", data: result })

            // Registrado depois do envio da resposta — auditService.record nunca
            // lança (absorve falhas internamente). `metadata` guarda só os
            // filtros usados, nunca o conteúdo retornado (que já é, ele
            // mesmo, uma trilha de auditoria de outros usuários).
            await this.auditService.record({
                userId: adminUserId,
                action: "ADMIN_AUDIT_LOG_VIEW",
                outcome: "SUCCESS",
                resourceType: "AuditLog",
                metadata: {
                    userId: query.userId,
                    action: query.action,
                    outcome: query.outcome,
                    resourceType: query.resourceType,
                    resourceId: query.resourceId,
                    from: query.from?.toISOString(),
                    to: query.to?.toISOString(),
                    page: query.page,
                    pageSize: query.pageSize,
                },
                ...getRequestContext(req),
            })
        } catch (error) {
            next(error)
        }
    }
}
