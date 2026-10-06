import type { PropertyResponse } from "@/modules/property/property.repository.js"
import type { MeterDemandRollupResponse } from "@/modules/meter/meter-demand-rollup.repository.js"
import { ValidationError } from "@/shared/errors/AppError.js"
import type { TariffPost } from "@/generated/prisma/client.js"

export type ContractedDemand = { post: TariffPost | null; contractedDemandKw: number }

/**
 * Demanda(s) contratada(s) do Grupo A a partir da Property, por modalidade:
 * Verde/Convencional Binômia têm 1 demanda só (post null); Azul tem 2 (ponta
 * e fora de ponta). Compartilhado entre o cálculo de custo (`ConsumptionService`)
 * e a avaliação do alerta de ultrapassagem (`DemandAlertScheduler`) — os dois
 * precisam comparar a mesma demanda medida contra a mesma demanda contratada,
 * então extraído para não arriscar os dois divergirem.
 */
export function resolveContractedDemands(
    property: PropertyResponse,
    modality: "GREEN" | "BLUE",
): ContractedDemand[] {
    if (modality === "GREEN") {
        if (property.contractedDemandKw === null) {
            throw new ValidationError("Propriedade do Grupo A sem demanda contratada cadastrada")
        }
        return [{ post: null, contractedDemandKw: property.contractedDemandKw }]
    }

    if (property.contractedDemandPeakKw === null || property.contractedDemandOffPeakKw === null) {
        throw new ValidationError(
            "Propriedade do Grupo A Azul sem as duas demandas contratadas cadastradas",
        )
    }
    return [
        { post: "PEAK", contractedDemandKw: property.contractedDemandPeakKw },
        { post: "OFF_PEAK", contractedDemandKw: property.contractedDemandOffPeakKw },
    ]
}

// Maior potência média (W) entre os postos do mês, convertida para kW; `null`
// quando o mês não tem nenhuma janela completa observada.
function measuredDemandKwForMonthOrNull(rows: MeterDemandRollupResponse[]): number | null {
    if (rows.length === 0) return null
    return Math.max(...rows.map((r) => r.maxAvgPowerW)) / 1000
}

/**
 * Demanda medida (kW) para uma entrada de `resolveContractedDemands`, ou
 * `null` quando não há janela medida: `null` (Verde) usa o maior valor entre
 * os postos do mês; um posto concreto (Azul) usa só o rollup daquele posto —
 * cada demanda contratada da Azul só é comparada com a medição do mesmo posto,
 * nunca com a do outro. É a semântica de ausência (nunca 0 kW) que a meta de
 * demanda, o relatório de demanda e o Painel compartilham.
 */
export function measuredDemandKwOrNull(
    post: TariffPost | null,
    rows: MeterDemandRollupResponse[],
): number | null {
    if (post === null) {
        return measuredDemandKwForMonthOrNull(rows)
    }
    const row = rows.find((r) => r.post === post)
    return row ? row.maxAvgPowerW / 1000 : null
}

/**
 * Mesma demanda de {@link measuredDemandKwOrNull}, com 0 kW no lugar da
 * ausência — de propósito, para o cálculo de custo e o alerta de
 * ultrapassagem: mês sem nenhuma janela completa observada nunca gera
 * ultrapassagem por ausência de dado (mesma cautela contra janela incompleta
 * aplicada ao apurar a demanda medida).
 */
export function measuredDemandKwFor(
    post: TariffPost | null,
    rows: MeterDemandRollupResponse[],
): number {
    return measuredDemandKwOrNull(post, rows) ?? 0
}
