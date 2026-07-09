import type { AuditRepository, AuditLogFilters, PaginatedAuditLogs } from "@/shared/audit/audit.repository.js"
import type { AuditLogQuery } from "@/modules/admin/admin.schema.js"

export class AdminService {
    constructor(private readonly auditRepository: AuditRepository) {}

    // Traduz a query já validada (admin.schema.ts) em filtros do repository —
    // wrapper fino, sem checagem de ownership: gated apenas por role
    // (requireRole("ADMIN") no middleware da rota).
    async listAuditLogs(query: AuditLogQuery): Promise<PaginatedAuditLogs> {
        const filters: AuditLogFilters = {
            ...(query.userId && { userId: query.userId }),
            ...(query.action && { action: query.action }),
            ...(query.outcome && { outcome: query.outcome }),
            ...(query.resourceType && { resourceType: query.resourceType }),
            ...(query.resourceId && { resourceId: query.resourceId }),
            ...(query.from && { from: query.from }),
            ...(query.to && { to: query.to }),
        }

        return this.auditRepository.findMany(filters, query.page, query.pageSize)
    }
}
