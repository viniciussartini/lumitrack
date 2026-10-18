import { bucketDateKey, bucketMonthKey, toLocalDateKey, toLocalMonthKey } from "@/lib/dashboardKpis"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

export interface MonthFigures {
    kwh: number
    /** `null` quando o custo não é calculável para o alvo e a tarifa. */
    costBrl: number | null
}

/**
 * Consumo de hoje a partir do bucket de dia mais recente do resumo. Os
 * buckets só existem para dias com leitura, então o mais recente ser de outro
 * dia quer dizer que hoje ainda não consumiu. `null` = o alvo não tem leitura
 * nenhuma (o resumo omite o item).
 */
export const resolveTodayKwh = (
    item: ConsumptionSummaryItem | undefined,
    now: Date,
): number | null => {
    if (!item) return null
    return bucketDateKey(item.bucketStart) === toLocalDateKey(now) ? item.kwhConsumed : 0
}

/**
 * Consumo e custo do mês corrente a partir do bucket de mês mais recente do
 * resumo — mesma lógica de `resolveTodayKwh`. A ausência de `costBrl` no item
 * é o sinal de custo não calculável, e vale mesmo quando o último bucket é de
 * um mês anterior: nesse caso o consumo do mês zera, o custo continua ausente
 * em vez de virar um zero enganoso.
 */
export const resolveMonthFigures = (
    item: ConsumptionSummaryItem | undefined,
    now: Date,
): MonthFigures | null => {
    if (!item) return null
    const isCurrentMonth = bucketMonthKey(item.bucketStart) === toLocalMonthKey(now)
    return {
        kwh: isCurrentMonth ? item.kwhConsumed : 0,
        costBrl: item.costBrl === undefined ? null : isCurrentMonth ? item.costBrl : 0,
    }
}
