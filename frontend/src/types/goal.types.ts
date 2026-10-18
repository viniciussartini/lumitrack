/** Unidade da meta: consumo em kWh, custo em reais ou demanda em kW (teto mensal de pico). */
export type GoalUnit = "KWH" | "BRL" | "KW"

/** Meta anual de uma propriedade, de consumo (kWh), de custo (R$) ou de demanda (kW). */
export interface Goal {
    id: string
    propertyId: string
    year: number
    unit: GoalUnit
    referenceYear: number
    /** Alvo de janeiro a dezembro na unidade da meta, sempre 12 valores. */
    monthlyTargets: number[]
    /** % da meta (do mês e do ano acumulado) a partir do qual o usuário é avisado. */
    alertPercent: number
    createdAt: string
    updatedAt: string
}

/** Valores que a edição troca; ano e propriedade não mudam. */
export interface GoalUpdateInput {
    referenceYear: number
    monthlyTargets: number[]
    alertPercent: number
}

/** Corpo de `POST /api/goals`. */
export interface GoalCreateInput extends GoalUpdateInput {
    propertyId: string
    year: number
    unit: GoalUnit
}

/** Em curso (ano corrente e futuros) ou o veredito de um ano que já acabou. */
export type GoalSituation = "IN_PROGRESS" | "MET" | "NOT_MET"

export interface GoalProgressMonth {
    /** 1 (janeiro) a 12 (dezembro). */
    month: number
    target: number
    /** Nulo sem leitura no mês, ou mês que ainda não aconteceu: ausência, não zero. */
    realized: number | null
}

/** Acompanhamento de uma meta: realizado por mês, desvio acumulado e situação. */
export interface GoalProgress {
    goalId: string
    year: number
    unit: GoalUnit
    months: GoalProgressMonth[]
    yearTarget: number
    /** Soma dos meses com leitura até o mês corrente; nulo sem nenhuma leitura. */
    realized: number | null
    /** Nulo sem base de comparação ou com meta zerada. */
    deviationPercent: number | null
    /** Só no ano corrente. */
    currentMonthTarget: number | null
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
    unit: GoalUnit
    alertPercent: number
    /** Mês corrente contra a meta do mês. */
    monthly: GoalAlertPeriod
    /** Acumulado do ano contra a meta anual. */
    annual: GoalAlertPeriod
}
