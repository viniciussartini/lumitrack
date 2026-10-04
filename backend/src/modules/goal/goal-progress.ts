import { toSaoPauloLocal } from "@/shared/time/localTime.js"

/** Situação de uma meta: em curso (ano corrente e futuros) ou o veredito de um ano que acabou. */
export type GoalSituation = "IN_PROGRESS" | "MET" | "NOT_MET"

export type GoalProgressMonth = {
    /** 1 (janeiro) a 12 (dezembro). */
    month: number
    targetKwh: number
    /** `null` quando o mês não tem leitura (ou ainda não aconteceu): ausência, não zero. */
    realizedKwh: number | null
}

export type GoalProgressSummary = {
    months: GoalProgressMonth[]
    yearTargetKwh: number
    /** Soma dos meses com leitura até o mês corrente; `null` sem nenhuma leitura. */
    realizedKwh: number | null
    /** Meta dos mesmos meses do `realizedKwh`, com o mês corrente proporcional aos dias. */
    comparedTargetKwh: number | null
    /** `null` sem base de comparação ou com meta zerada. */
    deviationPercent: number | null
    /** Só no ano corrente. */
    currentMonthTargetKwh: number | null
    /** `null` num ano passado sem nenhuma leitura. */
    situation: GoalSituation | null
}

export type GoalProgressInput = {
    year: number
    /** 12 valores, de janeiro a dezembro. */
    monthlyKwh: number[]
    /** 12 posições; `null` onde o mês não tem leitura. */
    realizedByMonth: (number | null)[]
    now: Date
}

const MONTHS_IN_YEAR = 12

/** Dias do mês `monthIndex` (0–11) de `year`, calendário gregoriano. */
const daysInMonth = (year: number, monthIndex: number): number =>
    new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

/**
 * Quanto da meta de cada mês já "venceu": 1 para meses encerrados, a fração
 * dos dias decorridos para o mês corrente e 0 para os que ainda virão.
 */
function elapsedWeights(year: number, now: Date): number[] {
    const local = toSaoPauloLocal(now)
    const currentYear = local.getUTCFullYear()

    if (year < currentYear) return Array.from({ length: MONTHS_IN_YEAR }, () => 1)
    if (year > currentYear) return Array.from({ length: MONTHS_IN_YEAR }, () => 0)

    const currentMonth = local.getUTCMonth()
    const elapsedFraction = local.getUTCDate() / daysInMonth(year, currentMonth)
    return Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
        if (month < currentMonth) return 1
        return month === currentMonth ? elapsedFraction : 0
    })
}

/**
 * Acompanhamento de uma meta anual: realizado por mês, desvio acumulado e
 * situação. Só os meses com leitura entram no desvio — um mês sem leitura
 * fica fora da meta comparada e do realizado, para um buraco de leitura não
 * parecer economia. O ano corrente conta o mês em curso proporcionalmente aos
 * dias decorridos, para o consumo parcial não ser medido contra a meta cheia.
 *
 * @param input - Ano, meta mensal, realizado por mês e o instante de referência.
 * @returns Os 12 meses e os totais para os cards e a tabela.
 */
export function computeGoalProgress(input: GoalProgressInput): GoalProgressSummary {
    const { year, monthlyKwh, now } = input
    const weights = elapsedWeights(year, now)
    const local = toSaoPauloLocal(now)
    const currentYear = local.getUTCFullYear()

    const months = monthlyKwh.map((targetKwh, index): GoalProgressMonth => {
        const reading = input.realizedByMonth[index] ?? null
        const happened = (weights[index] ?? 0) > 0
        return { month: index + 1, targetKwh, realizedKwh: happened ? reading : null }
    })
    const withReading = months.filter((m) => m.realizedKwh !== null)

    const realizedKwh =
        withReading.length === 0 ? null : sum(withReading.map((m) => m.realizedKwh ?? 0))
    const comparedTargetKwh =
        withReading.length === 0
            ? null
            : sum(withReading.map((m) => m.targetKwh * (weights[m.month - 1] ?? 0)))

    const deviationPercent =
        realizedKwh !== null && comparedTargetKwh !== null && comparedTargetKwh > 0
            ? (realizedKwh / comparedTargetKwh - 1) * 100
            : null

    return {
        months,
        yearTargetKwh: sum(monthlyKwh),
        realizedKwh,
        comparedTargetKwh,
        deviationPercent,
        currentMonthTargetKwh: year === currentYear ? (monthlyKwh[local.getUTCMonth()] ?? 0) : null,
        situation: resolveSituation(year, currentYear, realizedKwh, comparedTargetKwh),
    }
}

function resolveSituation(
    year: number,
    currentYear: number,
    realizedKwh: number | null,
    comparedTargetKwh: number | null,
): GoalSituation | null {
    if (year >= currentYear) return "IN_PROGRESS"
    if (realizedKwh === null || comparedTargetKwh === null) return null
    return realizedKwh <= comparedTargetKwh ? "MET" : "NOT_MET"
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)
