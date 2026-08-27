import type { TargetType } from "@/types/meter.types"

/**
 * Leituras agregadas por minuto/hora. Alimenta o gráfico
 * "Consumo em tempo real" (`RealtimeChartCard`), reconstruindo o histórico a
 * partir do que já está persistido em `MeterReading`, em vez de nascer
 * vazio a cada carregamento de página. Diferente de `ConsumptionBucket`
 * (`GET /api/consumption`, granularidade hour+, com custo/tarifa) — este é
 * `GET /api/meter-readings`, granularidade minute/hour, sem custo nenhum.
 */
export type MeterReadingGranularity = "minute" | "hour"

/** Um balde agregado — item de `GET /api/meter-readings`. */
export interface MeterReadingBucket {
    bucketStart: string
    avgPowerW: number
}

/** Query params de `GET /api/meter-readings`. `from`/`to` obrigatórios. */
export interface ListMeterReadingsParams {
    targetType: TargetType
    targetId: string
    granularity: MeterReadingGranularity
    from: string
    to: string
}
