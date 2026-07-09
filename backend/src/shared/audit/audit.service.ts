import type { AuditRepository } from "@/shared/audit/audit.repository.js"
import type { AuditEntryInput } from "@/shared/audit/audit.types.js"
import { logger } from "@/shared/logger/logger.js"

export class AuditService {
    constructor(private readonly auditRepository: AuditRepository) {}

    // Nunca deixa uma falha ao persistir o audit log derrubar a requisição
    // que está sendo auditada — a ação de negócio (login, CRUD, etc.) já
    // aconteceu; perder o registro de auditoria é grave, mas não tão grave
    // quanto quebrar a funcionalidade por causa dela. A falha em si vai pro
    // logger estruturado para não passar despercebida.
    async record(entry: AuditEntryInput): Promise<void> {
        logger.info({ audit: entry }, `audit:${entry.action}`)

        try {
            await this.auditRepository.create(entry)
        } catch (error) {
            logger.error({ err: error, entry }, "Falha ao persistir audit log")
        }
    }
}
