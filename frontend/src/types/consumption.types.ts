import type { TargetType } from "@/types/meter.types"

/**
 * Consumo agregado. Substitui o antigo modelo de
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

/**
 * Posto tarifário — janela de ponta configurável por distribuidora.
 * INTERMEDIATE é exclusivo da Tarifa Branca (Grupo B): a 1h imediatamente
 * antes/depois da ponta, em dia útil — o Grupo A nunca produz esse valor.
 */
export type TariffPost = "PEAK" | "INTERMEDIATE" | "OFF_PEAK"

export const TARIFF_POST_LABELS: Record<TariffPost, string> = {
    PEAK: "Ponta",
    INTERMEDIATE: "Intermediário",
    OFF_PEAK: "Fora de ponta",
}

/** Janela de energia reativa excedente — indutiva (ponta) ou capacitiva (fora de ponta). */
export type ReactiveWindow = "INDUCTIVE" | "CAPACITIVE"

/**
 * Parcela de demanda de um posto horário — um item para Verde (post null),
 * dois para Azul (PEAK e OFF_PEAK).
 */
export interface GroupADemandPost {
    post: TariffPost | null
    contractedDemandKw: number
    measuredDemandKw: number
    demandBrl: number
    ultrapassagemBrl: number
}

/** Excedente de energia reativa (R$) apurado numa janela indutiva/capacitiva. */
export interface GroupAReactiveWindowBreakdown {
    window: ReactiveWindow
    excessKvarh: number
    ereBrl: number
}

/**
 * Decomposição da conta binômia do Grupo A — presente só no bucket
 * mensal de uma Propriedade do Grupo A; ausente para Grupo B e para
 * qualquer outro alvo/granularidade.
 */
export interface GroupABreakdown {
    contractedDemandKw: number
    demandByPost: GroupADemandPost[]
    demandBrl: number
    ultrapassagemBrl: number
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    ereByWindow: GroupAReactiveWindowBreakdown[]
    ereBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

/**
 * Decomposição da conta da Tarifa Branca (Grupo B) — presente só no bucket
 * mensal de uma Propriedade com `groupBModality` WHITE; ausente para
 * Convencional e para qualquer outro alvo/granularidade. `energyByPost`
 * vazio quando `belowAvailabilityFloor` é `true` — abaixo do piso, a conta
 * inteira usa a tarifa Convencional (REN 1.098/2024), sem decomposição por
 * posto (ver `TariffService.calculateForGroupBWhite` no backend).
 */
export interface GroupBWhiteBreakdown {
    belowAvailabilityFloor: boolean
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    energyBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

/** Um bucket agregado de consumo — item de `GET /api/consumption`. */
export interface ConsumptionBucket {
    bucketStart: string
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
    groupA?: GroupABreakdown
    groupBWhite?: GroupBWhiteBreakdown
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

/** Query params de `GET /api/consumption/summary`. */
export interface ConsumptionSummaryParams {
    targetType: TargetType
    /** Um tipo só vale pra lista inteira — mistura não faz sentido. */
    ids: string[]
    granularity: BucketSize
    from?: Date
    to?: Date
}

/**
 * Item de `GET /api/consumption/summary` — o bucket mais recente de 1 alvo.
 * `costBrl` só vem quando o custo é calculável para o alvo e a tarifa (Área e
 * Dispositivo de Grupo A ou Tarifa Branca não têm custo próprio); o consumo
 * (`kwhConsumed`) vem sempre.
 */
export interface ConsumptionSummaryItem extends Omit<ConsumptionBucket, "costBrl"> {
    id: string
    targetType: TargetType
    costBrl?: number
}
