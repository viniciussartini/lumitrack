import type { ReportScheduleRunner } from "@/modules/report-schedule/ReportScheduleRunner.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "ReportScheduleScheduler" })

const INTERVAL_MS = 15 * 60 * 1000

/**
 * Dispara o envio dos relatórios agendados. Roda no boot, que recupera o que
 * venceu com o servidor fora do ar, e depois a cada 15 minutos — o envio sai
 * no máximo 15 minutos depois das 06:00, e uma falha de SMTP é retomada na
 * passada seguinte.
 */
export class ReportScheduleScheduler {
    private timer: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(private readonly runner: ReportScheduleRunner) {}

    start(): void {
        void this.runOnce()
        this.timer = setInterval(() => {
            void this.runOnce()
        }, INTERVAL_MS)
        log.info("Iniciado. O envio de relatórios agendados roda agora e a cada 15 minutos.")
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        log.info("Parado.")
    }

    // Uma passada lenta não pode se sobrepor à seguinte (enviaria em dobro), e
    // nenhuma falha derruba o processo: é um job de fundo.
    async runOnce(): Promise<void> {
        if (this.running) return
        this.running = true
        try {
            await this.runner.runDue()
        } catch (err) {
            log.error({ err }, "Falha inesperada ao executar os envios de relatórios agendados")
        } finally {
            this.running = false
        }
    }
}
