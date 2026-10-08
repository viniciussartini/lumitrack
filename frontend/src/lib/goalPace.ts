import { MONTHS_IN_YEAR, MONTH_LABELS } from "@/lib/goals"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { GoalProgressMonth, GoalUnit } from "@/types/goal.types"

/** Unidades que o Painel acompanha: a demanda (kW) não está no desenho do bloco. */
export type PaceUnit = Exclude<GoalUnit, "KW">

/** Valor de um dia fechado do mês que tem leitura. */
export interface DailyValue {
    /** Dia do mês, de 1 a 31. */
    day: number
    value: number
}

/** Um ponto do gráfico: o acumulado até ali contra a meta acumulada até ali. */
export interface PacePoint {
    label: string
    /** Nulo no dia/mês sem leitura ou que ainda não fechou: sem barra, nunca 0. */
    accumulated: number | null
    targetAccumulated: number
}

/** O que o bloco mostra: os cards (acumulado, projeção, situação) e o gráfico. */
export interface Pace {
    points: PacePoint[]
    /** Soma dos períodos com leitura; nulo sem nenhuma. */
    accumulated: number | null
    /** Fechamento projetado do período; nulo sem base. */
    projected: number | null
    /** Projeção contra a meta, em %; nulo sem projeção ou com meta zerada. */
    situationPercent: number | null
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

/**
 * Dias com leitura a partir dos buckets diários. O dia vem dos dígitos de
 * `bucketStart`, que já são o horário de parede de São Paulo (nunca deslocar o
 * fuso). Em R$ o dia sem custo calculável fica de fora — ausência, não zero.
 */
export const dailyValuesFromBuckets = (
    buckets: readonly ConsumptionBucket[],
    unit: PaceUnit,
): DailyValue[] =>
    buckets.flatMap((bucket): DailyValue[] => {
        const value = unit === "BRL" ? bucket.costBrl : bucket.kwhConsumed
        if (value === undefined) return []
        return [{ day: new Date(bucket.bucketStart).getUTCDate(), value }]
    })

/**
 * Fechamento do mês: a média dos dias com leitura estendida a todos os dias do
 * mês. Dia sem leitura fica fora da média, para um buraco não parecer economia.
 *
 * @returns O total projetado; nulo sem nenhum dia com leitura.
 */
export const projectMonthClosing = (input: {
    accumulated: number
    readingDays: number
    daysInMonth: number
}): number | null =>
    input.readingDays === 0 ? null : (input.accumulated / input.readingDays) * input.daysInMonth

/**
 * Fechamento do ano: a média dos meses **fechados** com leitura × 12. O mês
 * corrente fica de fora porque está pela metade e puxaria a média para baixo.
 *
 * @param months - Os 12 meses do acompanhamento.
 * @param currentMonthIndex - Mês corrente, de 0 (janeiro) a 11.
 * @returns O total projetado; nulo sem nenhum mês fechado com leitura.
 */
export const projectYearClosing = (
    months: readonly GoalProgressMonth[],
    currentMonthIndex: number,
): number | null => {
    const closed = months
        .slice(0, currentMonthIndex)
        .flatMap((entry) => (entry.realized === null ? [] : [entry.realized]))
    return closed.length === 0 ? null : (sum(closed) / closed.length) * MONTHS_IN_YEAR
}

/**
 * Situação do fechamento: quanto a projeção passa (+) ou fica abaixo (−) da meta, em %.
 *
 * @returns Nulo sem projeção ou com meta zerada (não há base de comparação).
 */
export const closingSituation = (projected: number | null, target: number): number | null =>
    projected === null || target <= 0 ? null : (projected / target - 1) * 100

/**
 * Ritmo do mês corrente. A meta acumulada cresce proporcional aos dias; o
 * acumulado só tem barra nos dias fechados com leitura.
 *
 * @param input.daily - Dias fechados com leitura.
 * @param input.closedDays - Dias já fechados (hoje, que está incompleto, não conta).
 * @param input.daysInMonth - Dias do mês.
 * @param input.target - Meta do mês na unidade escolhida.
 */
export const buildMonthPace = (input: {
    daily: readonly DailyValue[]
    closedDays: number
    daysInMonth: number
    target: number
}): Pace => {
    const { daily, closedDays, daysInMonth, target } = input
    const valueByDay = new Map(daily.map((entry) => [entry.day, entry.value]))

    let running = 0
    const points = Array.from({ length: daysInMonth }, (_, index): PacePoint => {
        const day = index + 1
        const value = valueByDay.get(day)
        if (value !== undefined) running += value
        const hasBar = day <= closedDays && value !== undefined
        return {
            label: String(day),
            accumulated: hasBar ? running : null,
            targetAccumulated: (target * day) / daysInMonth,
        }
    })

    const accumulated = daily.length === 0 ? null : sum(daily.map((entry) => entry.value))
    const projected =
        accumulated === null
            ? null
            : projectMonthClosing({ accumulated, readingDays: daily.length, daysInMonth })

    return { points, accumulated, projected, situationPercent: closingSituation(projected, target) }
}

/**
 * Ritmo do ano corrente, a partir do acompanhamento da meta: o acumulado soma
 * os meses com leitura e a meta acumulada soma a meta de cada mês.
 *
 * @param input.months - Os 12 meses de `GET /api/goals/progress`.
 * @param input.yearTarget - Meta do ano na unidade escolhida.
 * @param input.currentMonthIndex - Mês corrente, de 0 (janeiro) a 11.
 */
export const buildYearPace = (input: {
    months: readonly GoalProgressMonth[]
    yearTarget: number
    currentMonthIndex: number
}): Pace => {
    const { months, yearTarget, currentMonthIndex } = input

    let runningRealized = 0
    let runningTarget = 0
    const points = months.map((entry, index): PacePoint => {
        runningTarget += entry.target
        if (entry.realized !== null) runningRealized += entry.realized
        return {
            label: MONTH_LABELS[index] ?? String(entry.month),
            accumulated: entry.realized === null ? null : runningRealized,
            targetAccumulated: runningTarget,
        }
    })

    const withReading = months.flatMap((entry) => (entry.realized === null ? [] : [entry.realized]))
    const accumulated = withReading.length === 0 ? null : sum(withReading)
    const projected = projectYearClosing(months, currentMonthIndex)

    return {
        points,
        accumulated,
        projected,
        situationPercent: closingSituation(projected, yearTarget),
    }
}
