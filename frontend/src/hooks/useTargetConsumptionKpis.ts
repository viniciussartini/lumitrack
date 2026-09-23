import { useConsumptionSummary } from "@/hooks/queries/useConsumption"
import { resolveMonthFigures, resolveTodayKwh, type MonthFigures } from "@/lib/targetKpis"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

export interface TargetConsumptionKpis {
    /** `true` enquanto o resumo do dia ou do mês ainda não chegou. */
    isLoading: boolean
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
 *
 * "Hoje" e "este mês" são o instante em que cada resumo foi buscado, não o da
 * montagem da página: o resumo só traz o bucket mais recente, e um "agora"
 * congelado deixaria uma sessão que atravessa a meia-noite comparando o bucket
 * do dia novo contra o dia velho — um zero que parece dado.
 */
export const useTargetConsumptionKpis = (
    targetType: TargetType,
    targetId: string | undefined,
): TargetConsumptionKpis => {
    const ids = targetId ? [targetId] : []
    const dayQuery = useConsumptionSummary(targetType, ids, "day")
    const monthQuery = useConsumptionSummary(targetType, ids, "month")

    const forTarget = (items: ConsumptionSummaryItem[] | undefined) =>
        items?.find((item) => item.id === targetId)

    return {
        isLoading: dayQuery.isLoading || monthQuery.isLoading,
        todayKwh: resolveTodayKwh(
            forTarget(dayQuery.data?.items),
            new Date(dayQuery.dataUpdatedAt),
        ),
        month: resolveMonthFigures(
            forTarget(monthQuery.data?.items),
            new Date(monthQuery.dataUpdatedAt),
        ),
    }
}
