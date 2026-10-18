import type { TargetType } from "@/types/meter.types"

/**
 * As 9 chaves curtas do design para a área de análise configurável —
 * espelha `backend/src/modules/meter/meter-reading.schema.ts`
 * (`meterReadingSeriesMetricSchema`). Não são nomes em inglês porque o
 * design já usa essas chaves como valor de `<select>`.
 */
export type MeterReadingSeriesMetric =
    "tensao" | "corrente" | "pativa" | "preativa" | "paparente" | "fp" | "thdv" | "thdi" | "freq"

export type MeterReadingSeriesWindow = "hora" | "dia"

export type MeterReadingSeriesAggregationMinutes = 1 | 5 | 15 | 30

/** Um balde da série — item de `GET /api/meter-readings/series`. */
export interface MeterReadingSeriesBucket {
    bucketStart: string
    min: number | null
    avg: number | null
    max: number | null
}

/** Query params de `GET /api/meter-readings/series`. */
export interface MeterReadingSeriesParams {
    targetType: TargetType
    targetId: string
    metric: MeterReadingSeriesMetric
    window: MeterReadingSeriesWindow
    day: string
    hour?: number
    aggregationMinutes?: MeterReadingSeriesAggregationMinutes
}

/** Granularidade do balde na comparação — derivada pelo backend da duração dos períodos. */
export type ComparePeriodsGranularity = "hour" | "day"

/** Query params de `GET /api/meter-readings/compare-periods` (instantes ISO, fim exclusivo). */
export interface MeterReadingComparePeriodsParams {
    targetType: TargetType
    targetId: string
    metric: MeterReadingSeriesMetric
    fromA: string
    toA: string
    fromB: string
    toB: string
}

/** Mínimo/média/máximo da grandeza no período inteiro — `null` quando nunca reportada. */
export interface MeterReadingPeriodSummary {
    min: number | null
    avg: number | null
    max: number | null
}

/** Um dos dois períodos da resposta de `GET /api/meter-readings/compare-periods`. */
export interface MeterReadingComparePeriod {
    from: string
    to: string
    items: MeterReadingSeriesBucket[]
    summary: MeterReadingPeriodSummary
}

/** Diferença de B sobre A — `null` quando algum período não tem dado da grandeza. */
export interface MeterReadingPeriodDiff {
    absolute: number | null
    percent: number | null
}

/** Resposta de `GET /api/meter-readings/compare-periods`. */
export interface MeterReadingComparePeriodsResponse {
    metric: MeterReadingSeriesMetric
    granularity: ComparePeriodsGranularity
    periodA: MeterReadingComparePeriod
    periodB: MeterReadingComparePeriod
    diff: MeterReadingPeriodDiff
}
