import type { GoalUnit } from "@/generated/prisma/client.js"
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
    unit: GoalUnit
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
        // Uma leitura por propriedade e unidade: a meta em kWh e a em R$ da mesma
        // propriedade leem o realizado de fontes diferentes.
        const sources = new Map(goals.map((goal) => [`${goal.propertyId}:${goal.unit}`, goal]))
        const readings = await Promise.all(
            [...sources].map(
                async ([key, goal]) =>
                    [
                        key,
                        await this.consumptionReader.monthlyValues(
                            userId,
                            goal.propertyId,
                            year,
                            goal.unit,
                            now,
                        ),
                    ] as const,
            ),
        )
        const monthlyBySource = new Map(readings)

        const items = goals.map((goal) => {
            const monthly = monthlyBySource.get(`${goal.propertyId}:${goal.unit}`)
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
            monthlyTargets: goal.monthlyTargets,
            realizedByMonth,
            now,
        })
        const state = computeGoalAlertState(progress, goal.alertPercent, now)
        return {
            goalId: goal.id,
            propertyId: goal.propertyId,
            propertyName: goal.property.name,
            year: goal.year,
            unit: goal.unit,
            alertPercent: goal.alertPercent,
            monthly: { ...state.month, notified: goal.alertNotifiedMonth === month },
            annual: { ...state.year, notified: goal.alertNotifiedYear },
        }
    }
}
