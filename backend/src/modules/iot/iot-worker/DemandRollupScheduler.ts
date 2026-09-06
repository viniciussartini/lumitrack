/**
 * DemandRollupScheduler — rollup incremental da demanda medida do Grupo A
 * (RN19: maior potência média em janelas de 15 min, por posto tarifário).
 *
 * Deliberadamente um scheduler IRMÃO do `MinuteRollupScheduler`, não uma
 * extensão dele — o comentário de topo daquela classe já declara que ela é
 * mantida simples de propósito, sem resolver hierarquia (medidor→propriedade
 * →distribuidora) nem calcular nada além das grandezas cruas. Resolver essa
 * hierarquia (para pegar a janela de ponta da distribuidora) é exatamente o
 * que este scheduler faz, então ele convive ao lado — mesmo padrão de
 * `RetentionPurgeScheduler`/`TariffFlagSyncScheduler` em `server.ts`.
 *
 * Alinhado ao minuto cheio como o `MinuteRollupScheduler`, mas com uma folga
 * de alguns segundos: o alvo de cada tick é o minuto anterior ao corrente, e
 * só roda depois que o `MinuteRollupScheduler` (que dispara exatamente no
 * :00) teve tempo de persistir esse minuto. Uma janela de lookback de alguns
 * minutos (não só o minuto-alvo exato) torna o mecanismo auto-recuperável:
 * se um flush atrasar além da folga, o medidor aparece de novo no tick
 * seguinte e a janela é recalculada — `upsertIfGreater` é idempotente,
 * recalcular o mesmo valor não piora nada.
 */
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"
import { computeTrailingWindowAverage } from "@/shared/tariff/demandRollup.js"
import { classifyPost } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidays } from "@/shared/time/holidays.js"
import { toSaoPauloLocal, fromSaoPauloLocal } from "@/shared/time/localTime.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "DemandRollupScheduler" })

const MINUTE_MS = 60 * 1000
const WINDOW_SIZE_MINUTES = 15
// Folga entre o minuto cheio e o disparo deste scheduler — dá tempo do
// MinuteRollupScheduler (que dispara exatamente no :00) terminar o flush.
const START_OFFSET_MS = 5_000
// Quantos minutos pra trás do minuto-alvo a consulta de "medidores ativos"
// olha — rede de segurança contra um flush atrasado além da folga acima.
const LOOKBACK_MINUTES = 3

export class DemandRollupScheduler {
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private alignTimer: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly meterRepository: MeterRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly demandRollupRepository: MeterDemandRollupRepository,
    ) {}

    /** Inicia o scheduler, alinhando o primeiro tick ao próximo minuto cheio (+ folga). */
    start(): void {
        const delay = this.msUntilNextMinute() + START_OFFSET_MS

        log.info(
            { firstTickAt: new Date(Date.now() + delay).toISOString() },
            `Iniciado. Primeiro tick em ${Math.round(delay / 1000)}s`,
        )

        this.alignTimer = setTimeout(() => {
            void this.tick()
            this.flushTimer = setInterval(() => {
                void this.tick()
            }, 60_000)
        }, delay)
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
     * Processa o minuto mais recentemente completado: descobre quais
     * medidores tiveram leitura na janela de lookback, filtra os do Grupo A
     * (RN23 — só ele tem demanda) e atualiza o rollup de cada um. Público
     * para testes e para o tick periódico.
     *
     * @param now - Instante de referência (injetável para teste).
     */
    async tick(now: Date = new Date()): Promise<void> {
        const targetMinute = new Date(this.truncateToMinute(now).getTime() - MINUTE_MS)
        const lookbackStart = new Date(targetMinute.getTime() - LOOKBACK_MINUTES * MINUTE_MS)

        const meterIds = await this.meterReadingRepository.findMeterIdsWithReadingsSince(
            lookbackStart,
            targetMinute,
        )
        if (meterIds.length === 0) {
            return
        }

        const targets = await this.meterRepository.findManyByIdsWithTarget(meterIds)

        const groupAMeterIds = meterIds.filter(
            (meterId) => targets.get(meterId)?.property?.tariffGroup === "GROUP_A",
        )
        if (groupAMeterIds.length === 0) {
            return
        }

        const results = await Promise.allSettled(
            groupAMeterIds.map((meterId) =>
                this.processOne(meterId, targetMinute, targets.get(meterId)!.property!),
            ),
        )

        for (let i = 0; i < results.length; i++) {
            const result = results[i]!
            if (result.status === "rejected") {
                log.error(
                    { meterId: groupAMeterIds[i], err: result.reason },
                    "Falha ao processar rollup de demanda — seguindo para os demais medidores",
                )
            }
        }
    }

    private async processOne(
        meterId: string,
        targetMinute: Date,
        property: PropertyResponse,
    ): Promise<void> {
        const distributor = await this.distributorRepository.findById(property.distributorId)
        if (!distributor) {
            return
        }

        // Fail-closed (RN24): sem janela de ponta configurada, não há como
        // classificar o posto — não adivinha 18h-21h por padrão.
        if (distributor.peakWindowStartHour === null || distributor.peakWindowEndHour === null) {
            log.warn(
                { meterId, distributorId: distributor.id },
                "Distribuidora sem janela de ponta configurada — rollup de demanda pulado",
            )
            return
        }

        const readings = await this.meterReadingRepository.findTrailingReadings(
            meterId,
            targetMinute,
            WINDOW_SIZE_MINUTES,
        )

        const avgPowerW = computeTrailingWindowAverage(readings, targetMinute, WINDOW_SIZE_MINUTES)
        if (avgPowerW === null) {
            // Janela incompleta (medidor offline em parte do intervalo) —
            // nunca vira demanda. Não é erro, é ausência de dado suficiente.
            return
        }

        const localEnd = toSaoPauloLocal(targetMinute)
        const holidays = getNationalHolidays(localEnd.getUTCFullYear())
        // A janela é classificada pelo posto do seu MINUTO FINAL — decisão
        // de modelagem para o caso raro de uma janela atravessar a fronteira
        // ponta/fora-ponta (ex.: minutos 20:46-21:00): atribui-se ao instante
        // em que a medição se encerra, convenção usual de medição de demanda.
        const post = classifyPost(
            localEnd,
            {
                peakWindowStartHour: distributor.peakWindowStartHour,
                peakWindowEndHour: distributor.peakWindowEndHour,
            },
            holidays,
        )

        const periodStart = fromSaoPauloLocal(
            new Date(Date.UTC(localEnd.getUTCFullYear(), localEnd.getUTCMonth(), 1)),
        )

        await this.demandRollupRepository.upsertIfGreater(
            meterId,
            periodStart,
            post,
            avgPowerW,
            targetMinute,
        )
    }

    private truncateToMinute(date: Date): Date {
        const d = new Date(date)
        d.setSeconds(0, 0)
        return d
    }

    private msUntilNextMinute(): number {
        const now = new Date()
        const next = new Date(now)
        next.setSeconds(60, 0)
        return next.getTime() - now.getTime()
    }
}
