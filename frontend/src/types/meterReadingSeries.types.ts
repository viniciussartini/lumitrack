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
