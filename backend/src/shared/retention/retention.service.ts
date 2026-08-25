import type { AuthRepository } from "@/modules/auth/auth.repository.js"
import type { AuditRepository } from "@/shared/audit/audit.repository.js"
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import type { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import type { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "RetentionService" })

// Retenção e expurgo de dados. As 4 primeiras chaves são o número de dias
// de retenção após o evento que torna o dado "inativo" (token
// expirado/revogado, reset usado/expirado, log antigo) — depois disso, o
// dado é removido. As 4 últimas (ADR-0014) já não são Art. 15/16 — sem
// titular real, é armazenamento/performance, não prazo LGPD. Vem de env.ts
// (DATA_RETENTION_*), nunca hardcoded aqui, para que o período possa ser
// ajustado sem deploy de código.
export type RetentionDays = {
    authToken: number
    passwordReset: number
    auditLog: number
    refreshToken: number
    meterReading: number
    alertTriggerEvent: number
    mfaBackupCode: number
    tariffFlagHistory: number
}

export type PurgeSummary = {
    authTokensDeleted: number
    passwordResetsDeleted: number
    auditLogsDeleted: number
    refreshTokensDeleted: number
    meterReadingsDeleted: number
    alertTriggerEventsDeleted: number
    mfaBackupCodesDeleted: number
    tariffFlagHistoryDeleted: number
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export class RetentionService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly auditRepository: AuditRepository,
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly alertTriggerEventRepository: AlertTriggerEventRepository,
        private readonly tariffFlagHistoryRepository: TariffFlagHistoryRepository,
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
        const refreshTokensDeleted = await this.authRepository.deleteExpiredOrRevokedRefreshTokens(
            daysAgo(this.retentionDays.refreshToken),
        )
        const meterReadingsDeleted = await this.meterReadingRepository.deleteOlderThan(
            daysAgo(this.retentionDays.meterReading),
        )
        const alertTriggerEventsDeleted = await this.alertTriggerEventRepository.deleteOlderThan(
            daysAgo(this.retentionDays.alertTriggerEvent),
        )
        const mfaBackupCodesDeleted = await this.authRepository.deleteUsedMfaBackupCodes(
            daysAgo(this.retentionDays.mfaBackupCode),
        )
        const tariffFlagHistoryDeleted = await this.tariffFlagHistoryRepository.deleteOlderThan(
            daysAgo(this.retentionDays.tariffFlagHistory),
        )

        const summary: PurgeSummary = {
            authTokensDeleted,
            passwordResetsDeleted,
            auditLogsDeleted,
            refreshTokensDeleted,
            meterReadingsDeleted,
            alertTriggerEventsDeleted,
            mfaBackupCodesDeleted,
            tariffFlagHistoryDeleted,
        }
        log.info(summary, "Expurgo de retenção concluído")
        return summary
    }
}
