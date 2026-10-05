import { toSaoPauloLocal } from "@/shared/time/localTime.js"

/** Situação de uma meta: em curso (ano corrente e futuros) ou o veredito de um ano que acabou. */
export type GoalSituation = "IN_PROGRESS" | "MET" | "NOT_MET"

export type GoalProgressMonth = {
    /** 1 (janeiro) a 12 (dezembro). */
    month: number
    target: number
    /** `null` quando o mês não tem leitura (ou ainda não aconteceu): ausência, não zero. */
    realized: number | null
}

export type GoalProgressSummary = {
    months: GoalProgressMonth[]
    yearTarget: number
    /** Soma dos meses com leitura até o mês corrente; `null` sem nenhuma leitura. */
    realized: number | null
    /** Meta dos mesmos meses do `realized`, com o mês corrente proporcional aos dias. */
    comparedTarget: number | null
    /** `null` sem base de comparação ou com meta zerada. */
    deviationPercent: number | null
    /** Só no ano corrente. */
    currentMonthTarget: number | null
    /** `null` num ano passado sem nenhuma leitura. */
    situation: GoalSituation | null
}

export type GoalProgressInput = {
    year: number
    /** 12 valores, de janeiro a dezembro. */
    monthlyTargets: number[]
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
    const { year, monthlyTargets, now } = input
    const weights = elapsedWeights(year, now)
    const local = toSaoPauloLocal(now)
    const currentYear = local.getUTCFullYear()

    const months = monthlyTargets.map((target, index): GoalProgressMonth => {
        const reading = input.realizedByMonth[index] ?? null
        const happened = (weights[index] ?? 0) > 0
        return { month: index + 1, target, realized: happened ? reading : null }
    })
    const withReading = months.filter((m) => m.realized !== null)

    const realized = withReading.length === 0 ? null : sum(withReading.map((m) => m.realized ?? 0))
    const comparedTarget =
        withReading.length === 0
            ? null
            : sum(withReading.map((m) => m.target * (weights[m.month - 1] ?? 0)))

    const deviationPercent =
        realized !== null && comparedTarget !== null && comparedTarget > 0
            ? (realized / comparedTarget - 1) * 100
            : null

    return {
        months,
        yearTarget: sum(monthlyTargets),
        realized,
        comparedTarget,
        deviationPercent,
        currentMonthTarget:
            year === currentYear ? (monthlyTargets[local.getUTCMonth()] ?? 0) : null,
        situation: resolveSituation(year, currentYear, realized, comparedTarget),
    }
}

function resolveSituation(
    year: number,
    currentYear: number,
    realized: number | null,
    comparedTarget: number | null,
): GoalSituation | null {
    if (year >= currentYear) return "IN_PROGRESS"
    if (realized === null || comparedTarget === null) return null
    return realized <= comparedTarget ? "MET" : "NOT_MET"
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)
