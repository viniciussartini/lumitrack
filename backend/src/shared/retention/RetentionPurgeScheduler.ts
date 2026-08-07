import type { RetentionService } from "@/shared/retention/retention.service.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "RetentionScheduler" })

/**
 * Retenção e expurgo de dados (Art. 15/16 LGPD).
 *
 * Roda o expurgo uma vez imediatamente no boot (cobre o caso de o servidor
 * ter ficado fora do ar por mais de 24h, garantindo que o atraso não vire
 * acúmulo indefinido) e depois a cada 24h. Diferente do
 * HourlyRollupScheduler (que se alinha exatamente à virada da hora porque
 * agrupa dados por período), o expurgo não precisa de alinhamento de
 * horário — ele só remove o que já passou do prazo de retenção, então o
 * momento exato em que roda no dia é irrelevante. Por isso, sem dependência
 * nova (node-cron): setInterval simples já é suficiente.
 */
export class RetentionPurgeScheduler {
    private timer: ReturnType<typeof setInterval> | null = null

    constructor(private readonly retentionService: RetentionService) {}

    start(): void {
        void this.runOnce()

        this.timer = setInterval(
            () => {
                void this.runOnce()
            },
            24 * 60 * 60 * 1000,
        )

        log.info("Iniciado. Expurgo roda agora e a cada 24h.")
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        log.info("Parado.")
    }

    // Falha no expurgo não deve derrubar o processo — é um job de
    // manutenção em background, não algo que serve requisições.
    async runOnce(): Promise<void> {
        try {
            await this.retentionService.purgeExpiredData()
        } catch (err) {
            log.error({ err }, "Falha ao executar expurgo de retenção")
        }
    }
}
