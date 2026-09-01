import type {
    AuditRepository,
    AuditLogFilters,
    PaginatedAuditLogs,
} from "@/shared/audit/audit.repository.js"
import type { AuditLogQuery } from "@/modules/admin/admin.schema.js"

/** Consulta a logs de auditoria administrativos — sem checagem de ownership: acesso é gated apenas por role. */
export class AdminService {
    /** @param auditRepository - Acesso aos logs de auditoria persistidos. */
    constructor(private readonly auditRepository: AuditRepository) {}

    /**
     * Traduz a query já validada em filtros do repository — wrapper fino,
     * sem checagem de ownership: gated apenas por role
     * (`requireRole("ADMIN")` no middleware da rota).
     *
     * @param query - Query já validada (`admin.schema.ts`).
     * @returns Página de logs de auditoria que casam com os filtros.
     */
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
