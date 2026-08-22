import type { TargetType } from "@/types/meter.types"

/**
 * Consumo agregado — reformulação IoT (Fase 3). Substitui o antigo modelo de
 * registros manuais (`ConsumptionRecord`/`ConsumptionPeriod`) por buckets
 * agregados via `GET /api/consumption`, calculados a partir de `MeterReading`
 * (persistência minuto a minuto). Somente leitura — não há mais criação
 * manual de consumo pelo usuário.
 */
export type Granularity = "hour" | "day" | "month" | "year"

/**
 * Tamanho do bucket agregado pela API (parâmetro `granularity` de
 * `GET /api/consumption`) — um nível abaixo da granularidade escolhida na UI,
 * que é a janela consultada. A tradução entre os dois vive em
 * `lib/consumptionWindow.ts`.
 */
export type BucketSize = "minute" | Granularity

/** Ordem cronológica dos buckets devolvidos pela API. */
export type BucketOrder = "asc" | "desc"

export const GRANULARITY_LABELS: Record<Granularity, string> = {
    hour: "Hora",
    day: "Dia",
    month: "Mês",
    year: "Ano",
}

/**
 * Itens por página da tabela de consumo — maior que o `DEFAULT_PAGE_SIZE` das
 * demais listagens porque um bucket é uma linha de série temporal, não uma
 * entidade: a janela de uma hora tem até 60 deles. Teto do backend: 31.
 */
export const CONSUMPTION_PAGE_SIZE = 30

/** Granularidades disponíveis nas details pages (Property/Area/Device). */
export const DETAILS_GRANULARITIES: readonly Granularity[] = ["hour", "day"]

/** Granularidades disponíveis na página /relatorios — os 4 níveis. */
export const REPORT_GRANULARITIES: readonly Granularity[] = ["hour", "day", "month", "year"]

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
    granularity: BucketSize
    /** Início da janela (inclusivo). Ausente = sem recorte. */
    from?: Date
    /** Fim da janela (exclusivo). Ausente = sem recorte. */
    to?: Date
    /** Default do backend: `desc` (mais recente primeiro). */
    order?: BucketOrder
    page?: number
    pageSize?: number
}
