import type { TargetType } from "@/types/meter.types"

/**
 * Consumo agregado — reformulação IoT (Fase 3). Substitui o antigo modelo de
 * registros manuais (`ConsumptionRecord`/`ConsumptionPeriod`) por buckets
 * agregados via `GET /api/consumption`, calculados a partir de `MeterReading`
 * (persistência minuto a minuto). Somente leitura — não há mais criação
 * manual de consumo pelo usuário.
 */
export type Granularity = "hour" | "day" | "month" | "year"

export const GRANULARITY_LABELS: Record<Granularity, string> = {
    hour: "Hora",
    day: "Dia",
    month: "Mês",
    year: "Ano",
}

/** Granularidades disponíveis nas details pages (Property/Area/Device). */
export const DETAILS_GRANULARITIES: readonly Granularity[] = ["hour", "day"]

/** Granularidades disponíveis na página /relatorios — os 4 níveis. */
export const REPORT_GRANULARITIES: readonly Granularity[] = [
    "hour",
    "day",
    "month",
    "year",
]

/** Um bucket agregado de consumo — item de `GET /api/consumption`. */
export interface ConsumptionBucket {
    bucketStart: string
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
}

/** Query params de `GET /api/consumption`. */
export interface ListConsumptionParams {
    targetType: TargetType
    targetId: string
    granularity: Granularity
    page?: number
    pageSize?: number
}
