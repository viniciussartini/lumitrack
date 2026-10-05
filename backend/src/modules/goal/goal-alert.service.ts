import { computeGoalAlertState, type GoalAlertPeriodState } from "@/modules/goal/goal-alert.js"
import type { GoalConsumptionReader } from "@/modules/goal/goal-consumption.js"
import { computeGoalProgress } from "@/modules/goal/goal-progress.js"
import type { GoalRepository, GoalWithProperty } from "@/modules/goal/goal.repository.js"
import { toSaoPauloLocal } from "@/shared/time/localTime.js"

export type GoalAlertPeriodResponse = GoalAlertPeriodState & {
    /** O aviso deste período já saiu. */
    notified: boolean
}

/** Estado do alerta de uma meta do ano corrente, como a página de Alertas o mostra. */
export type GoalAlertResponse = {
    goalId: string
    propertyId: string
    propertyName: string
    year: number
    alertPercent: number
    /** Mês corrente contra a meta do mês. */
    monthly: GoalAlertPeriodResponse
    /** Acumulado do ano contra a meta anual. */
    annual: GoalAlertPeriodResponse
}

/**
 * Estado dos alertas de meta de um usuário: para cada meta do ano corrente, o
 * quanto do mês e do ano o consumo já representa, se isso alcança o percentual
 * de alerta e se o aviso já saiu. Usa as mesmas regras do avaliador periódico,
 * então a tela nunca contradiz o que o sino avisou.
 */
export class GoalAlertService {
    /**
     * @param goalRepository - Metas do usuário no ano corrente.
     * @param consumptionReader - Consumo mensal do medidor de cada propriedade.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly goalRepository: GoalRepository,
        private readonly consumptionReader: GoalConsumptionReader,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Estado do alerta de cada meta do ano corrente do usuário, em todas as propriedades.
     *
     * @param userId - Id do usuário autenticado.
     * @returns Uma linha por meta, por nome de propriedade.
     */
    async list(userId: string): Promise<{ items: GoalAlertResponse[] }> {
        const now = this.now()
        const local = toSaoPauloLocal(now)
        const year = local.getUTCFullYear()
        const month = local.getUTCMonth() + 1

        const goals = await this.goalRepository.findByUserAndYear(userId, year)
        const propertyIds = [...new Set(goals.map((goal) => goal.propertyId))]
        const readings = await Promise.all(
            propertyIds.map(
                async (propertyId) =>
                    [
                        propertyId,
                        await this.consumptionReader.monthlyKwh(propertyId, year, now),
                    ] as const,
            ),
        )
        const monthlyByProperty = new Map(readings)

        const items = goals.map((goal) => {
            const monthly = monthlyByProperty.get(goal.propertyId)
            return this.toResponse(goal, month, now, monthly?.forYear(year) ?? [])
        })
        return { items }
    }

    private toResponse(
        goal: GoalWithProperty,
        month: number,
        now: Date,
        realizedByMonth: (number | null)[],
    ): GoalAlertResponse {
        const progress = computeGoalProgress({
            year: goal.year,
            monthlyKwh: goal.monthlyKwh,
            realizedByMonth,
            now,
        })
        const state = computeGoalAlertState(progress, goal.alertPercent, now)
        return {
            goalId: goal.id,
            propertyId: goal.propertyId,
            propertyName: goal.property.name,
            year: goal.year,
            alertPercent: goal.alertPercent,
            monthly: { ...state.month, notified: goal.alertNotifiedMonth === month },
            annual: { ...state.year, notified: goal.alertNotifiedYear },
        }
    }
}
