import type { AuthRepository } from "@/modules/auth/auth.repository.js"
import type { AuditRepository } from "@/shared/audit/audit.repository.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "RetentionService" })

// #10 — Retenção e expurgo de dados (Art. 15/16 LGPD). Cada chave é o número
// de dias de retenção após o evento que torna o dado "inativo" (token
// expirado/revogado, reset usado/expirado, log antigo) — depois disso, o
// dado é removido. Vem de env.ts (DATA_RETENTION_*), nunca hardcoded aqui,
// para que o período possa ser ajustado sem deploy de código.
export type RetentionDays = {
    authToken: number
    passwordReset: number
    auditLog: number
}

export type PurgeSummary = {
    authTokensDeleted: number
    passwordResetsDeleted: number
    auditLogsDeleted: number
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export class RetentionService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly auditRepository: AuditRepository,
        private readonly retentionDays: RetentionDays,
    ) {}

    // Ponto de entrada único, chamado pelo RetentionPurgeScheduler (1x no
    // boot + a cada 24h) — também exposto diretamente para testes, sem
    // precisar esperar o scheduler.
    async purgeExpiredData(): Promise<PurgeSummary> {
        const authTokensDeleted = await this.authRepository.deleteExpiredOrRevokedTokens(
            daysAgo(this.retentionDays.authToken),
        )
        const passwordResetsDeleted = await this.authRepository.deleteExpiredPasswordResets(
            daysAgo(this.retentionDays.passwordReset),
        )
        const auditLogsDeleted = await this.auditRepository.deleteOlderThan(
            daysAgo(this.retentionDays.auditLog),
        )

        const summary: PurgeSummary = { authTokensDeleted, passwordResetsDeleted, auditLogsDeleted }
        log.info(summary, "Expurgo de retenção concluído")
        return summary
    }
}
