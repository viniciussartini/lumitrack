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

// Maior potência média (W) entre os postos do mês, convertida para kW — mês
// sem nenhuma janela completa observada mede 0 kW, nunca gera ultrapassagem
// por ausência de dado (mesma cautela contra janela incompleta aplicada ao
// apurar a demanda medida).
function measuredDemandKwForMonth(rows: MeterDemandRollupResponse[]): number {
    if (rows.length === 0) return 0
    return Math.max(...rows.map((r) => r.maxAvgPowerW)) / 1000
}

/**
 * Demanda medida (kW) para uma entrada de `resolveContractedDemands`: `null`
 * (Verde) usa o maior valor entre os postos do mês; um posto concreto (Azul)
 * usa só o rollup daquele posto — cada demanda contratada da Azul só é
 * comparada com a medição do mesmo posto, nunca com a do outro. Compartilhada
 * pelo mesmo motivo de `resolveContractedDemands`.
 */
export function measuredDemandKwFor(
    post: TariffPost | null,
    rows: MeterDemandRollupResponse[],
): number {
    if (post === null) {
        return measuredDemandKwForMonth(rows)
    }
    const row = rows.find((r) => r.post === post)
    return row ? row.maxAvgPowerW / 1000 : 0
}
