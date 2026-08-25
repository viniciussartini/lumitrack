/**
 * MinuteRollupScheduler — persiste os baldes de minuto completos no banco
 * (substitui o antigo HourlyRollupScheduler; granularidade 1 minuto em vez
 * de 1 hora).
 *
 * Mesma estratégia de alinhamento do scheduler anterior: o primeiro flush
 * dispara no início do próximo minuto cheio (XX:XX:00), depois a cada 60s
 * exatos — não um setInterval "solto" a partir do boot.
 *
 * Diferente do antigo scheduler, este flush NÃO resolve hierarquia (device →
 * area → property → distributor) nem calcula custo — só persiste as
 * grandezas elétricas cruas por medidor/minuto via MeterReadingRepository.
 * O custo é calculado sob demanda na agregação (Fase 3, TariffService).
 * Também não dispara verificação de alertas — isso passa a ser feito amostra
 * a amostra pelo AlertEvaluator (Fase 4), não mais no rollup.
 */
import type { MinuteBuffer } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import type { PoolStats } from "@/shared/database/prisma.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "MinuteRollupScheduler" })

/**
 * Provedor de estatísticas do pool de conexões, injetado em vez de importado
 * direto — mantém o scheduler testável sem abrir uma conexão real de banco
 * (ver `shared/database/prisma.ts#getPoolStats`, injetado pelo composition
 * root em `server.ts`).
 */
export type PoolStatsProvider = () => PoolStats | null

export class MinuteRollupScheduler {
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private alignTimer: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly buffer: MinuteBuffer,
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly getPoolStats: PoolStatsProvider = () => null,
    ) {}

    /**
     * Inicia o scheduler, alinhando o primeiro flush ao início do próximo
     * minuto cheio.
     */
    start(): void {
        const msUntilNextMinute = this.msUntilNextMinute()

        log.info(
            { firstFlushAt: new Date(Date.now() + msUntilNextMinute).toISOString() },
            `Iniciado. Primeiro flush em ${Math.round(msUntilNextMinute / 1000)}s`,
        )

        this.alignTimer = setTimeout(() => {
            void this.flush()

            this.flushTimer = setInterval(() => {
                void this.flush()
            }, 60_000)
        }, msUntilNextMinute)
    }

    /** Para o scheduler — usado no graceful shutdown do servidor. */
    stop(): void {
        if (this.alignTimer) {
            clearTimeout(this.alignTimer)
            this.alignTimer = null
        }
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        log.info("Parado.")
    }

    /**
     * Persiste todos os baldes de minuto já completos (exclui o minuto em
     * curso). Público para testes e para o flush periódico.
     */
    async flush(): Promise<void> {
        const snapshots = this.buffer.drainCompletedBuckets()
        await this.persist(snapshots)
    }

    /**
     * Persiste TODOS os baldes, incluindo o minuto em curso — usado no
     * shutdown para não perder o minuto parcial.
     */
    async flushAll(): Promise<void> {
        const snapshots = this.buffer.drainAll()
        await this.persist(snapshots)
    }

    private async persist(snapshots: ReturnType<MinuteBuffer["drainAll"]>): Promise<void> {
        if (snapshots.length === 0) {
            return
        }

        log.info(`Flush de ${snapshots.length} balde(s)...`)

        // Processa cada balde independentemente — a falha de um não deve
        // impedir o flush dos demais.
        const results = await Promise.allSettled(
            snapshots.map((snapshot) => this.meterReadingRepository.upsertMinute(snapshot)),
        )

        for (let i = 0; i < results.length; i++) {
            const result = results[i]!
            const snapshot = snapshots[i]!

            if (result.status === "rejected") {
                log.error(
                    {
                        meterId: snapshot.meterId,
                        minuteStart: snapshot.minuteStart,
                        err: result.reason,
                    },
                    "Falha ao persistir — devolvendo ao buffer",
                )
                // Reinsere no buffer para tentar novamente no próximo flush,
                // sem perder sampleCount/secondsCovered já acumulados.
                this.buffer.merge(snapshot)
            }
        }

        // Instrumentação de desempenho — o flush do minuto é o ponto de
        // maior concorrência de escrita do processo (até N upsertMinute
        // simultâneos), então é onde a saturação do pool mais aparece.
        // Nível debug: opt-in via LOG_LEVEL, sem custo em produção.
        const poolStats = this.getPoolStats()
        if (poolStats) {
            log.debug(poolStats, "Estatísticas do pool de conexões após o flush")
        }
    }

    /**
     * Calcula quantos milissegundos faltam para o início do próximo minuto.
     * Exemplo: 14:37:22.500 → faltam 37.5s até 14:38:00.000.
     */
    private msUntilNextMinute(): number {
        const now = new Date()
        const next = new Date(now)
        next.setSeconds(60, 0)
        return next.getTime() - now.getTime()
    }
}
