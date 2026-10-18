import type { GoalUnit } from "@/generated/prisma/client.js"
import type { GoalProgressSummary } from "@/modules/goal/goal-progress.js"
import { toSaoPauloLocal } from "@/shared/time/localTime.js"

export type GoalAlertPeriodState = {
    /** Realizado ÷ meta do período, em %; `null` sem leitura ou com meta zerada. */
    percent: number | null
    /** O realizado já alcançou o percentual de alerta da meta. */
    reached: boolean
}

export type GoalAlertState = {
    /** Mês corrente contra a meta do mês. */
    month: GoalAlertPeriodState
    /** Acumulado do ano contra a meta anual inteira. */
    year: GoalAlertPeriodState
}

const NOT_APPLICABLE: GoalAlertPeriodState = { percent: null, reached: false }

function periodState(
    realized: number | null,
    target: number,
    alertPercent: number,
): GoalAlertPeriodState {
    if (realized === null || target <= 0) return NOT_APPLICABLE
    return {
        percent: (realized / target) * 100,
        // Produto cruzado em vez de dividir: o limite exato (85% de 400 = 340)
        // não pode escapar por arredondamento de ponto flutuante.
        reached: realized * 100 >= alertPercent * target,
    }
}

/**
 * Estado do alerta de uma meta: o quanto do mês e do ano o realizado (consumo,
 * custo ou demanda, conforme a unidade) já representa e se isso alcança o
 * percentual configurado. Só a meta do ano
 * corrente é avaliada; as de outros anos devolvem ausência nos dois períodos.
 *
 * @param progress - Acompanhamento da meta (ver `computeGoalProgress`).
 * @param alertPercent - Percentual de alerta da meta.
 * @param now - Instante de referência, para achar o mês corrente em São Paulo.
 * @param unit - Unidade da meta: a demanda (kW) é pico e não tem período anual.
 * @returns Percentual e `reached` do mês e do ano.
 */
export function computeGoalAlertState(
    progress: GoalProgressSummary,
    alertPercent: number,
    now: Date,
    unit: GoalUnit,
): GoalAlertState {
    if (progress.currentMonthTarget === null) {
        return { month: NOT_APPLICABLE, year: NOT_APPLICABLE }
    }

    const currentMonth = progress.months[toSaoPauloLocal(now).getUTCMonth()]
    return {
        month: periodState(
            currentMonth?.realized ?? null,
            progress.currentMonthTarget,
            alertPercent,
        ),
        // Pico não acumula: não há "acumulado do ano" de demanda para avisar.
        year:
            unit === "KW"
                ? NOT_APPLICABLE
                : periodState(progress.realized, progress.yearTarget, alertPercent),
    }
}
