import type {
    Goal,
    GoalCreateInput,
    GoalProgress,
    GoalSituation,
    GoalUpdateInput,
} from "@/types/goal.types"

const SAO_PAULO_TZ = "America/Sao_Paulo"

/** Espelham os limites do backend, para o usuário ver o motivo antes de enviar. */
export const MIN_GOAL_YEAR = 2020
export const MAX_GOAL_YEAR = 2100
export const MIN_ALERT_PERCENT = 10
export const MAX_ALERT_PERCENT = 100
export const MONTHS_IN_YEAR = 12

export const MONTH_LABELS: readonly string[] = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
]

const DEFAULT_ALERT_PERCENT = 85

/** Ano civil de São Paulo — a meta vigora de 1º de janeiro a 31 de dezembro no horário local. */
export const currentGoalYear = (now: Date = new Date()): number =>
    Number(
        new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO_TZ, year: "numeric" }).format(now),
    )

/** Mês corrente em São Paulo, de 0 (janeiro) a 11 (dezembro). */
export const currentGoalMonthIndex = (now: Date = new Date()): number =>
    Number(
        new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO_TZ, month: "numeric" }).format(now),
    ) - 1

/** Meta de ano passado é imutável: nem edita nem exclui. */
export const isGoalLocked = (goal: Goal, currentYear: number): boolean => goal.year < currentYear

/** A meta do ano é a soma dos 12 meses. */
export const goalYearlyKwh = (goal: Goal): number =>
    goal.monthlyKwh.reduce((sum, kwh) => sum + kwh, 0)

export const formatKwh = (kwh: number): string => `${Math.round(kwh).toLocaleString("pt-BR")} kWh`

export const MONTH_NAMES: readonly string[] = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]

export type GoalTone = "success" | "danger" | "warning" | "muted"

/** Classes de cor por tom, para o texto e para o ponto de situação. */
export const GOAL_TONE_TEXT_CLASS: Record<GoalTone, string> = {
    success: "text-status-success",
    danger: "text-status-danger",
    warning: "text-status-warning",
    muted: "text-muted",
}

export const GOAL_TONE_DOT_CLASS: Record<GoalTone, string> = {
    success: "bg-status-success",
    danger: "bg-status-danger",
    warning: "bg-status-warning",
    muted: "bg-muted",
}

export interface GoalSituationView {
    label: string
    tone: GoalTone
}

/** Rótulo e tom da situação; ausência ("-") num ano passado sem leitura ou enquanto o acompanhamento não chega. */
export const describeSituation = (
    situation: GoalSituation | null | undefined,
): GoalSituationView => {
    if (situation === "IN_PROGRESS") return { label: "Em andamento", tone: "warning" }
    if (situation === "MET") return { label: "Cumprida", tone: "success" }
    if (situation === "NOT_MET") return { label: "Não cumprida", tone: "danger" }
    return { label: "-", tone: "muted" }
}

/** Desvio acumulado como "+2,5%" ou "−3,1%"; ausência é "-". */
export const formatDeviation = (percent: number | null | undefined): string => {
    if (percent === null || percent === undefined) return "-"
    const sign = percent >= 0 ? "+" : "−"
    return `${sign}${Math.abs(percent).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** Acima da meta é perigo; no limite ou abaixo, sucesso; sem desvio, neutro. */
export const deviationTone = (percent: number | null | undefined): GoalTone => {
    if (percent === null || percent === undefined) return "muted"
    return percent > 0 ? "danger" : "success"
}

/** Realizado de uma meta como texto, com "-" para ausência. */
export const formatRealized = (progress: GoalProgress | undefined): string =>
    progress?.realizedKwh == null ? "-" : formatKwh(progress.realizedKwh)

/** Frase do card "Metas de consumo anual" para a meta do ano corrente. */
export const describeCurrentGoal = (goal: Goal, monthIndex: number): string => {
    const monthKwh = goal.monthlyKwh[monthIndex] ?? 0
    return (
        `Teto de ${formatKwh(goalYearlyKwh(goal))} para ${goal.year} · referência ${goal.referenceYear}` +
        ` · meta do mês ${formatKwh(monthKwh)} · alerta ao atingir ${goal.alertPercent}%` +
        " · visível também na página de alertas"
    )
}

/** O rascunho do formulário; os números como os `<input>` os guardam. */
export interface GoalFormState {
    year: string
    referenceYear: string
    /** Atalho de preenchimento: repete o valor nos 12 meses. Não vai no payload. */
    specificKwh: string
    alertPercent: string
    months: string[]
}

const blankMonths = (): string[] => Array.from({ length: MONTHS_IN_YEAR }, () => "")

/**
 * Rascunho de uma meta nova. O ano sugerido é o primeiro, a partir do
 * corrente, que ainda não tem meta; a referência sugerida é o último ano
 * completo.
 */
export const initialGoalForm = (
    currentYear: number,
    existingYears: readonly number[],
): GoalFormState => {
    let year = currentYear
    while (existingYears.includes(year) && year < MAX_GOAL_YEAR) year += 1
    return {
        year: String(year),
        referenceYear: String(Math.max(MIN_GOAL_YEAR, currentYear - 1)),
        specificKwh: "",
        alertPercent: String(DEFAULT_ALERT_PERCENT),
        months: blankMonths(),
    }
}

/**
 * Rascunho de uma meta nova a partir de um ano que já passou ("usar como
 * referência"): o ano seguinte ao corrente (o primeiro ainda sem meta), o ano
 * escolhido como referência e cada mês preenchido com o realizado, arredondado
 * a kWh inteiro. Mês sem leitura fica vazio — nunca 0 —, e o consumo
 * específico é a média dos meses com leitura.
 *
 * @param reference - Meta do ano passado usada como base.
 * @param progress - Acompanhamento dessa meta; sem ele, os meses ficam vazios.
 * @param currentYear - Ano corrente em São Paulo.
 * @param existingYears - Anos em que a propriedade já tem meta.
 */
export const referenceGoalForm = (
    reference: Goal,
    progress: GoalProgress | undefined,
    currentYear: number,
    existingYears: readonly number[],
): GoalFormState => {
    const base = initialGoalForm(currentYear + 1, existingYears)
    const realized = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
        const kwh = progress?.months[index]?.realizedKwh
        return kwh === null || kwh === undefined ? null : Math.round(kwh)
    })
    const withReading = realized.filter((kwh): kwh is number => kwh !== null)
    const average =
        withReading.length === 0
            ? ""
            : String(
                  Math.round(withReading.reduce((sum, kwh) => sum + kwh, 0) / withReading.length),
              )

    return {
        ...base,
        referenceYear: String(reference.year),
        specificKwh: average,
        months: realized.map((kwh) => (kwh === null ? "" : String(kwh))),
    }
}

/** Rascunho de edição: os campos da meta salva. O atalho mostra a média mensal. */
export const goalToFormState = (goal: Goal): GoalFormState => ({
    year: String(goal.year),
    referenceYear: String(goal.referenceYear),
    specificKwh: String(Math.round(goalYearlyKwh(goal) / MONTHS_IN_YEAR)),
    alertPercent: String(goal.alertPercent),
    months: goal.monthlyKwh.map(String),
})

/** Aplica o consumo específico: repete o valor nos 12 meses. */
export const applySpecificKwh = (state: GoalFormState, specificKwh: string): GoalFormState => ({
    ...state,
    specificKwh,
    months: Array.from({ length: MONTHS_IN_YEAR }, () => specificKwh),
})

const isIntegerIn = (raw: string, min: number, max: number): boolean => {
    if (raw.trim() === "") return false
    const value = Number(raw)
    return Number.isInteger(value) && value >= min && value <= max
}

/**
 * Valida o rascunho contra as regras do servidor.
 *
 * @param state - Rascunho do formulário.
 * @param existingYears - Anos que a propriedade já tem meta, ignorado na edição.
 * @returns A primeira mensagem de erro, ou `null` se o rascunho é válido.
 */
export const validateGoalForm = (
    state: GoalFormState,
    existingYears: readonly number[] = [],
): string | null => {
    if (!isIntegerIn(state.year, MIN_GOAL_YEAR, MAX_GOAL_YEAR)) {
        return `O ano da meta deve estar entre ${MIN_GOAL_YEAR} e ${MAX_GOAL_YEAR}`
    }
    if (existingYears.includes(Number(state.year))) {
        return "Esta propriedade já tem uma meta para esse ano"
    }
    if (!isIntegerIn(state.referenceYear, MIN_GOAL_YEAR, MAX_GOAL_YEAR)) {
        return `O ano de referência deve estar entre ${MIN_GOAL_YEAR} e ${MAX_GOAL_YEAR}`
    }
    if (Number(state.referenceYear) >= Number(state.year)) {
        return "O ano de referência deve ser anterior ao ano da meta"
    }
    if (!isIntegerIn(state.alertPercent, MIN_ALERT_PERCENT, MAX_ALERT_PERCENT)) {
        return `O percentual de alerta deve ser de ${MIN_ALERT_PERCENT} a ${MAX_ALERT_PERCENT}`
    }
    const validMonths = state.months.every((month) => month.trim() !== "" && Number(month) >= 0)
    if (state.months.length !== MONTHS_IN_YEAR || !validMonths) {
        return "Informe a meta dos 12 meses, sem valores negativos"
    }
    return null
}

/** Corpo da edição, a partir de um rascunho já validado. */
export const buildGoalUpdateInput = (state: GoalFormState): GoalUpdateInput => ({
    referenceYear: Number(state.referenceYear),
    monthlyKwh: state.months.map(Number),
    alertPercent: Number(state.alertPercent),
})

/** Corpo da criação, a partir de um rascunho já validado. */
export const buildGoalCreateInput = (
    state: GoalFormState,
    propertyId: string,
): GoalCreateInput => ({
    ...buildGoalUpdateInput(state),
    propertyId,
    year: Number(state.year),
})
