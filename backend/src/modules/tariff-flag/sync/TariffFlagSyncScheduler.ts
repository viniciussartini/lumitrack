import type { TariffFlagSyncService } from "@/modules/tariff-flag/sync/TariffFlagSyncService.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "TariffFlagSyncScheduler" })

/**
 * #143 — sincronização automática da bandeira tarifária vigente (ADR-0007).
 *
 * Mesmo padrão do `RetentionPurgeScheduler`: roda uma vez imediatamente no
 * boot e depois a cada 24h. A bandeira muda no máximo uma vez por mês, e a
 * fonte (ANEEL) não tem SLA formal — não há motivo para polling mais
 * frequente que diário, e rodar no boot cobre o caso do servidor ter
 * ficado fora do ar quando a bandeira mudou.
 */
export class TariffFlagSyncScheduler {
    private timer: ReturnType<typeof setInterval> | null = null

    constructor(private readonly syncService: TariffFlagSyncService) {}

    start(): void {
        void this.runOnce()

        this.timer = setInterval(() => {
            void this.runOnce()
        }, 24 * 60 * 60 * 1000)

        log.info("Iniciado. Sincronização da bandeira tarifária roda agora e a cada 24h.")
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        log.info("Parado.")
    }

    // Falha na sincronização não deve derrubar o processo — é um job de
    // manutenção em background, não algo que serve requisições. O próprio
    // TariffFlagSyncService já trata falhas da fonte (falha fechada); este
    // try/catch é a última rede de segurança contra qualquer erro
    // inesperado não previsto pelo service.
    async runOnce(): Promise<void> {
        try {
            await this.syncService.syncOnce()
        } catch (err) {
            log.error({ err }, "Falha inesperada ao executar a sincronização da bandeira tarifária")
        }
    }
}
