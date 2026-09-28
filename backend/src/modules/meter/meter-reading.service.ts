import {
    listMeterReadingsQuerySchema,
    meterReadingSeriesQuerySchema,
    meterReadingComparePeriodsQuerySchema,
    type MeterReadingGranularity,
    type MeterReadingSeriesMetric,
    type MeterReadingSeriesWindow,
} from "@/modules/meter/meter-reading.schema.js"
import type {
    MeterReadingRepository,
    MeterReadingBucket,
} from "@/modules/meter/meter-reading.repository.js"
import {
    computeSeriesWindow,
    fillMissingBuckets,
    type SeriesBucketValues,
} from "@/modules/meter/meter-reading-series-window.js"
import {
    computeComparePeriodsWindow,
    computePeriodDiff,
    type ComparePeriodsGranularity,
    type PeriodDiff,
    type PeriodSummary,
} from "@/modules/meter/meter-reading-compare-periods.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

export type MeterReadingListResponse = {
    items: MeterReadingBucket[]
    granularity: MeterReadingGranularity
}

export type MeterReadingSeriesResponse = {
    items: SeriesBucketValues[]
    metric: MeterReadingSeriesMetric
    window: MeterReadingSeriesWindow
}

export type ComparePeriodResult = {
    from: Date
    to: Date
    items: SeriesBucketValues[]
    summary: PeriodSummary
}

export type ComparePeriodsResponse = {
    metric: MeterReadingSeriesMetric
    granularity: ComparePeriodsGranularity
    periodA: ComparePeriodResult
    periodB: ComparePeriodResult
    diff: PeriodDiff
}

/**
 * Leituras agregadas por minuto/hora — só o que o gráfico "ao vivo" precisa:
 * sem custo/tarifa, sem paginação (a janela já vem limitada por from/to).
 * Ver `ConsumptionService` para o equivalente de faturamento.
 */
export class MeterReadingService {
    /**
     * @param meterReadingRepository - Acesso às leituras agregadas persistidas.
     * @param meterRepository - Resolve o medidor vinculado ao alvo consultado.
     * @param propertyRepository - Usado para checar ownership subindo até a propriedade.
     * @param areaRepository - Usado para resolver a propriedade-mãe de um alvo do tipo área.
     * @param deviceRepository - Usado para resolver a área-mãe de um alvo do tipo dispositivo.
     */
    constructor(
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    /**
     * Série agregada de leituras do alvo informado, restrita ao titular.
     *
     * @param userId - Id do usuário autenticado (dono do alvo).
     * @param query - Query string bruta (alvo, granularidade e janela), validada aqui.
     * @returns Pontos agregados e a granularidade efetivamente aplicada.
     */
    async list(userId: string, query: unknown): Promise<MeterReadingListResponse> {
        const { targetType, targetId, granularity, from, to } = parseOrThrow(
            listMeterReadingsQuerySchema,
            query,
        )

        const property = await resolveRootProperty(targetType, targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(targetType, targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }

        const items = await this.meterReadingRepository.findAggregated(
            meter.id,
            granularity,
            from,
            to,
        )

        return { items, granularity }
    }

    /**
     * Série de uma grandeza (mínimo/média/máximo por balde) do alvo
     * informado, restrita ao titular — a área de análise configurável, não
     * o gráfico "ao vivo" (isso é {@link list}).
     *
     * @param userId - Id do usuário autenticado (dono do alvo).
     * @param query - Query string bruta (alvo, grandeza, janela, dia/hora/agregação), validada aqui.
     * @returns Os baldes completos da janela (sem lacuna) e a grandeza/janela efetivamente aplicadas.
     */
    async series(userId: string, query: unknown): Promise<MeterReadingSeriesResponse> {
        const parsed = parseOrThrow(meterReadingSeriesQuerySchema, query)
        const { targetType, targetId, metric, window } = parsed

        const property = await resolveRootProperty(targetType, targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(targetType, targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }

        // O schema (`z.discriminatedUnion` por `window`) já estreita `parsed`
        // para a variante certa — `hour`/`aggregationMinutes` só existem no
        // tipo quando `window="hora"`, sem precisar de asserção `!`.
        const { rangeFrom, rangeTo, bucketStarts } = computeSeriesWindow(parsed)
        const aggregationMinutes = parsed.window === "hora" ? parsed.aggregationMinutes : undefined

        const found = await this.meterReadingRepository.findSeries(
            meter.id,
            metric,
            window,
            aggregationMinutes,
            rangeFrom,
            rangeTo,
        )

        return { items: fillMissingBuckets(bucketStarts, found), metric, window }
    }

    /**
     * Comparação de dois períodos arbitrários de mesma duração, do alvo
     * informado, restrita ao titular — a mesma grandeza agregada em cada
     * período (baldes relativos ao início de cada um, ver
     * `meter-reading-compare-periods.ts`), mais a diferença da média de B
     * sobre a de A.
     *
     * @param userId - Id do usuário autenticado (dono do alvo).
     * @param query - Query string bruta (alvo, grandeza, período A e período B), validada aqui.
     * @returns Os dois períodos completos (sem lacuna) e a diferença entre eles.
     */
    async comparePeriods(userId: string, query: unknown): Promise<ComparePeriodsResponse> {
        const { targetType, targetId, metric, fromA, toA, fromB, toB } = parseOrThrow(
            meterReadingComparePeriodsQuerySchema,
            query,
        )

        const property = await resolveRootProperty(targetType, targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(targetType, targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }

        const { granularity, bucketSizeMs, periodA, periodB } = computeComparePeriodsWindow(
            { from: fromA, to: toA },
            { from: fromB, to: toB },
        )
        const bucketSeconds = bucketSizeMs / 1000

        const [resultA, resultB] = await Promise.all([
            this.fetchPeriodResult(meter.id, metric, periodA, bucketSeconds),
            this.fetchPeriodResult(meter.id, metric, periodB, bucketSeconds),
        ])

        return {
            metric,
            granularity,
            periodA: resultA,
            periodB: resultB,
            diff: computePeriodDiff(resultA.summary, resultB.summary),
        }
    }

    /**
     * Busca os baldes completos (sem lacuna) e o resumo de um único período
     * da comparação — extraído para {@link comparePeriods} disparar período
     * A e período B em paralelo sem repetir a montagem do resultado.
     *
     * @param meterId - Id do medidor.
     * @param metric - Grandeza escolhida.
     * @param period - Início/fim reais do período e os baldes esperados.
     * @param period.from - Início real do período, inclusive.
     * @param period.to - Fim real do período, exclusivo.
     * @param period.bucketStarts - Início de cada balde esperado do período.
     * @param bucketSeconds - Tamanho do balde em segundos, já derivado da duração.
     * @returns O período completo, com baldes e resumo.
     */
    private async fetchPeriodResult(
        meterId: string,
        metric: MeterReadingSeriesMetric,
        period: { from: Date; to: Date; bucketStarts: Date[] },
        bucketSeconds: number,
    ): Promise<ComparePeriodResult> {
        const [series, summary] = await Promise.all([
            this.meterReadingRepository.findPeriodSeries(
                meterId,
                metric,
                bucketSeconds,
                period.from,
                period.to,
            ),
            this.meterReadingRepository.findPeriodSummary(meterId, metric, period.from, period.to),
        ])

        return {
            from: period.from,
            to: period.to,
            items: fillMissingBuckets(period.bucketStarts, series),
            summary,
        }
    }
}
