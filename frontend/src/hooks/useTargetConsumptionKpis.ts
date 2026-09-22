import { useState } from "react"
import { useConsumptionSummary } from "@/hooks/queries/useConsumption"
import { resolveMonthFigures, resolveTodayKwh, type MonthFigures } from "@/lib/targetKpis"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

export interface TargetConsumptionKpis {
    /** kWh consumidos hoje; `null` enquanto carrega ou sem nenhuma leitura. */
    todayKwh: number | null
    /** Consumo e custo do mês corrente; `null` enquanto carrega ou sem leitura. */
    month: MonthFigures | null
}

/**
 * "Consumo hoje" e "Custo do mês" de um alvo, lidos do resumo de consumo — que
 * devolve o consumo mesmo quando o custo não é calculável (Grupo A e Tarifa
 * Branca em Área e Dispositivo). Passe `targetId` indefinido para não consultar
 * (alvo sem medidor).
 */
export const useTargetConsumptionKpis = (
    targetType: TargetType,
    targetId: string | undefined,
): TargetConsumptionKpis => {
    const [now] = useState(() => new Date())
    const ids = targetId ? [targetId] : []
    const dayQuery = useConsumptionSummary(targetType, ids, "day")
    const monthQuery = useConsumptionSummary(targetType, ids, "month")

    const forTarget = (items: ConsumptionSummaryItem[] | undefined) =>
        items?.find((item) => item.id === targetId)

    return {
        todayKwh: resolveTodayKwh(forTarget(dayQuery.data?.items), now),
        month: resolveMonthFigures(forTarget(monthQuery.data?.items), now),
    }
}
