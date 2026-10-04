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
