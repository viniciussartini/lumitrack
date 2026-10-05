import type { GoalUnit } from "@/generated/prisma/client.js"
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
    /** Meta dos mesmos meses do `realized`; em kWh o mês corrente é proporcional aos dias, em R$ conta inteiro. */
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
    /** Define como o ano agrega: kWh e R$ somam; kW (demanda) é pico. */
    unit: GoalUnit
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
 * dos dias decorridos para o mês corrente e 0 para os que ainda virão. Sem
 * `prorateCurrentMonth`, o mês corrente conta inteiro.
 */
function elapsedWeights(year: number, now: Date, prorateCurrentMonth: boolean): number[] {
    const local = toSaoPauloLocal(now)
    const currentYear = local.getUTCFullYear()

    if (year < currentYear) return Array.from({ length: MONTHS_IN_YEAR }, () => 1)
    if (year > currentYear) return Array.from({ length: MONTHS_IN_YEAR }, () => 0)

    const currentMonth = local.getUTCMonth()
    const elapsedFraction = prorateCurrentMonth
        ? local.getUTCDate() / daysInMonth(year, currentMonth)
        : 1
    return Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
        if (month < currentMonth) return 1
        return month === currentMonth ? elapsedFraction : 0
    })
}

/**
 * A meta do ano a partir dos 12 valores mensais: a soma em kWh e em R$; na
 * demanda (kW), que é um teto de pico e não se soma, a maior meta mensal.
 *
 * @param unit - Unidade da meta.
 * @param monthlyTargets - 12 valores, de janeiro a dezembro.
 * @returns A meta do ano na unidade da meta.
 */
export function yearlyTarget(unit: GoalUnit, monthlyTargets: number[]): number {
    return unit === "KW" ? Math.max(0, ...monthlyTargets) : sum(monthlyTargets)
}

type YearAggregate = {
    yearTarget: number
    realized: number | null
    comparedTarget: number | null
    deviationPercent: number | null
    /** O realizado respeita a meta; `null` quando não há leitura para dizer. */
    withinTarget: boolean | null
}

// kWh e R$ se somam ao longo do ano: o realizado é a soma dos meses com leitura,
// contra a meta desses mesmos meses (o mês corrente, pelo peso de `weights`).
function aggregateByTotal(
    monthlyTargets: number[],
    withReading: GoalProgressMonth[],
    weights: number[],
): YearAggregate {
    const yearTarget = yearlyTarget("KWH", monthlyTargets)
    if (withReading.length === 0) {
        return {
            yearTarget,
            realized: null,
            comparedTarget: null,
            deviationPercent: null,
            withinTarget: null,
        }
    }

    const realized = sum(withReading.map((m) => m.realized ?? 0))
    const comparedTarget = sum(withReading.map((m) => m.target * (weights[m.month - 1] ?? 0)))
    return {
        yearTarget,
        realized,
        comparedTarget,
        deviationPercent: comparedTarget > 0 ? (realized / comparedTarget - 1) * 100 : null,
        withinTarget: realized <= comparedTarget,
    }
}

// Demanda é um pico, não um total: o ano é a maior meta, o realizado é a maior
// demanda medida e o desvio é o do pior mês contra a meta daquele mês. Não há
// proporcional ao mês corrente — o pico até agora já é um piso do pico do mês.
function aggregateByPeak(
    monthlyTargets: number[],
    withReading: GoalProgressMonth[],
): YearAggregate {
    const yearTarget = yearlyTarget("KW", monthlyTargets)
    if (withReading.length === 0) {
        return {
            yearTarget,
            realized: null,
            comparedTarget: null,
            deviationPercent: null,
            withinTarget: null,
        }
    }

    const worst = withReading
        .filter((m) => m.target > 0)
        .reduce<GoalProgressMonth | null>(
            (acc, m) =>
                acc === null || (m.realized ?? 0) / m.target > (acc.realized ?? 0) / acc.target
                    ? m
                    : acc,
            null,
        )
    return {
        yearTarget,
        realized: Math.max(...withReading.map((m) => m.realized ?? 0)),
        comparedTarget: worst?.target ?? null,
        deviationPercent: worst ? ((worst.realized ?? 0) / worst.target - 1) * 100 : null,
        withinTarget: withReading.every((m) => (m.realized ?? 0) <= m.target),
    }
}

/**
 * Acompanhamento de uma meta anual: realizado por mês, desvio e situação. Só
 * os meses com leitura entram — um mês sem leitura fica fora da comparação,
 * para um buraco de leitura não parecer economia. kWh e R$ somam o ano. O
 * consumo (kWh) cresce de forma linear, então o mês corrente conta
 * proporcionalmente aos dias decorridos, para o parcial não ser medido contra
 * a meta cheia. O custo (R$) já traz desde o primeiro dia as cobranças fixas
 * (iluminação pública, piso de disponibilidade, demanda contratada), então o
 * parcial é um piso do custo do mês e conta contra a meta cheia, como o pico
 * da demanda (kW), que agrega pelo maior valor.
 *
 * @param input - Ano, unidade, meta mensal, realizado por mês e o instante de referência.
 * @returns Os 12 meses e os totais para os cards e a tabela.
 */
export function computeGoalProgress(input: GoalProgressInput): GoalProgressSummary {
    const { year, unit, monthlyTargets, now } = input
    const weights = elapsedWeights(year, now, unit === "KWH")
    const local = toSaoPauloLocal(now)
    const currentYear = local.getUTCFullYear()

    const months = monthlyTargets.map((target, index): GoalProgressMonth => {
        const reading = input.realizedByMonth[index] ?? null
        const happened = (weights[index] ?? 0) > 0
        return { month: index + 1, target, realized: happened ? reading : null }
    })
    const withReading = months.filter((m) => m.realized !== null)
    const aggregate =
        unit === "KW"
            ? aggregateByPeak(monthlyTargets, withReading)
            : aggregateByTotal(monthlyTargets, withReading, weights)

    return {
        months,
        yearTarget: aggregate.yearTarget,
        realized: aggregate.realized,
        comparedTarget: aggregate.comparedTarget,
        deviationPercent: aggregate.deviationPercent,
        currentMonthTarget:
            year === currentYear ? (monthlyTargets[local.getUTCMonth()] ?? 0) : null,
        situation: resolveSituation(year, currentYear, aggregate.withinTarget),
    }
}

function resolveSituation(
    year: number,
    currentYear: number,
    withinTarget: boolean | null,
): GoalSituation | null {
    if (year >= currentYear) return "IN_PROGRESS"
    if (withinTarget === null) return null
    return withinTarget ? "MET" : "NOT_MET"
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)
