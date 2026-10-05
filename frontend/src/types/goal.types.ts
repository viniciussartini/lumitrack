/** Meta anual de consumo (kWh) de uma propriedade. */
export interface Goal {
    id: string
    propertyId: string
    year: number
    referenceYear: number
    /** Meta de janeiro a dezembro, sempre 12 valores em kWh. */
    monthlyKwh: number[]
    /** % da meta (do mês e do ano acumulado) a partir do qual o usuário é avisado. */
    alertPercent: number
    createdAt: string
    updatedAt: string
}

/** Valores que a edição troca; ano e propriedade não mudam. */
export interface GoalUpdateInput {
    referenceYear: number
    monthlyKwh: number[]
    alertPercent: number
}

/** Corpo de `POST /api/goals`. */
export interface GoalCreateInput extends GoalUpdateInput {
    propertyId: string
    year: number
}

/** Em curso (ano corrente e futuros) ou o veredito de um ano que já acabou. */
export type GoalSituation = "IN_PROGRESS" | "MET" | "NOT_MET"

export interface GoalProgressMonth {
    /** 1 (janeiro) a 12 (dezembro). */
    month: number
    targetKwh: number
    /** Nulo sem leitura no mês, ou mês que ainda não aconteceu: ausência, não zero. */
    realizedKwh: number | null
}

/** Acompanhamento de uma meta: realizado por mês, desvio acumulado e situação. */
export interface GoalProgress {
    goalId: string
    year: number
    months: GoalProgressMonth[]
    yearTargetKwh: number
    /** Soma dos meses com leitura até o mês corrente; nulo sem nenhuma leitura. */
    realizedKwh: number | null
    /** Nulo sem base de comparação ou com meta zerada. */
    deviationPercent: number | null
    /** Só no ano corrente. */
    currentMonthTargetKwh: number | null
    /** Nulo num ano passado sem nenhuma leitura. */
    situation: GoalSituation | null
}

/** Um período (mês corrente ou ano acumulado) do alerta de uma meta. */
export interface GoalAlertPeriod {
    /** Consumo ÷ meta do período, em %; nulo sem leitura ou com meta zerada. */
    percent: number | null
    /** O consumo já alcançou o percentual de alerta da meta. */
    reached: boolean
    /** O aviso deste período já saiu. */
    notified: boolean
}

/** Estado do alerta de uma meta do ano corrente. */
export interface GoalAlert {
    goalId: string
    propertyId: string
    propertyName: string
    year: number
    alertPercent: number
    /** Mês corrente contra a meta do mês. */
    monthly: GoalAlertPeriod
    /** Acumulado do ano contra a meta anual. */
    annual: GoalAlertPeriod
}
