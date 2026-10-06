import type { TariffPost } from "@/generated/prisma/client.js"
import type { MeterDemandRollupResponse } from "@/modules/meter/meter-demand-rollup.repository.js"
import { measuredDemandKwOrNull, type ContractedDemand } from "@/shared/tariff/contractedDemand.js"

export type MonthMax = {
    /** Maior demanda do mês entre os postos; `null` sem nenhuma janela medida. */
    kw: number | null
    /** Fim da janela vencedora; `null` sem janela medida. */
    windowEnd: Date | null
}

/**
 * Máxima do mês: a maior potência média de 15 minutos entre os postos, em kW,
 * e quando a janela vencedora terminou. Mês sem janela medida é ausência, nunca 0 kW.
 */
export function resolveMonthMax(rows: MeterDemandRollupResponse[]): MonthMax {
    const winner = rows.reduce<MeterDemandRollupResponse | null>(
        (best, row) => (best === null || row.maxAvgPowerW > best.maxAvgPowerW ? row : best),
        null,
    )
    return winner
        ? { kw: winner.maxAvgPowerW / 1000, windowEnd: winner.windowEndAt }
        : { kw: null, windowEnd: null }
}

/**
 * O pior estouro entre as demandas contratadas, em % sobre a contratada: cada
 * demanda é comparada com a medição do mesmo posto (Verde: a maior entre os
 * postos), e o posto folgado não compensa o que estourou. É o desvio, sem a
 * tolerância que o custo aplica ao cobrar ultrapassagem.
 *
 * @param contracted - Demandas contratadas da propriedade.
 * @param rows - Rollup do mês.
 * @returns 0 quando nada passou; `null` quando nenhuma demanda tem janela medida.
 */
export function worstExceedancePercent(
    contracted: ContractedDemand[],
    rows: MeterDemandRollupResponse[],
): number | null {
    const overruns = contracted.flatMap((demand) => {
        const measured = measuredDemandKwOrNull(demand.post, rows)
        if (measured === null || demand.contractedDemandKw <= 0) return []
        return [Math.max(0, (measured / demand.contractedDemandKw - 1) * 100)]
    })
    return overruns.length === 0 ? null : Math.max(...overruns)
}

/** Demanda contratada que vale para uma janela: a do posto dela (Verde tem uma só). */
export function contractedKwForPost(
    contracted: ContractedDemand[],
    post: TariffPost | null,
): number {
    const match = contracted.find((demand) => demand.post === post) ?? contracted[0]
    return match?.contractedDemandKw ?? 0
}
