import type { TariffPost } from "@/types/consumption.types"

/** Janela de 15 minutos da curva de demanda do dia. */
export interface DemandPoint {
    /** Minuto em que a janela termina (ISO); a janela começa 14 minutos antes. */
    windowEnd: string
    /** Demanda da janela em kW; nulo se ainda não fechou ou está incompleta: ausência, não zero. */
    kw: number | null
    /** Posto da janela; nulo quando a distribuidora não tem janela de ponta (só Verde). */
    post: TariffPost | null
    /** Demanda contratada que vale para a janela: a do posto dela. */
    contractedKw: number
}

/** Demanda contratada: uma só na Verde (posto nulo), duas na Azul (ponta e fora de ponta). */
export interface ContractedDemand {
    post: TariffPost | null
    kw: number
}

/** Resposta de `GET /api/demand/overview`. */
export interface DemandOverview {
    propertyId: string
    modality: "GREEN" | "BLUE"
    windowMinutes: number
    contracted: ContractedDemand[]
    /** Janela de 15 minutos que termina no último minuto fechado. */
    current: { kw: number | null; windowEnd: string }
    /** Maior demanda do mês entre os postos; nulo sem janela medida. */
    monthMax: { kw: number | null; windowEnd: string | null }
    /** Pior estouro sobre a contratada, em %; 0 sem estouro; nulo sem janela medida. */
    exceedancePercent: number | null
    day: { date: string; points: DemandPoint[] }
}
