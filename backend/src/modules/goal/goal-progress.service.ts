import type { GoalConsumptionReader } from "@/modules/goal/goal-consumption.js"
import { computeGoalProgress, type GoalProgressSummary } from "@/modules/goal/goal-progress.js"
import { goalProgressQuerySchema } from "@/modules/goal/goal.schema.js"
import type { GoalRepository } from "@/modules/goal/goal.repository.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

/** Acompanhamento de uma meta, com o id para a tela casá-lo com a linha do histórico. */
export type GoalProgressResponse = GoalProgressSummary & { goalId: string; year: number }

/**
 * Acompanhamento das metas de uma propriedade: o consumo mensal realizado
 * contra a meta, o desvio e a situação de cada ano.
 */
export class GoalProgressService {
    /**
     * @param goalRepository - Metas da propriedade.
     * @param consumptionReader - Consumo mensal do medidor da propriedade.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly goalRepository: GoalRepository,
        private readonly consumptionReader: GoalConsumptionReader,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Acompanhamento de todas as metas de uma propriedade do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta (`propertyId`), validada aqui.
     * @returns Um item por meta, do ano mais recente ao mais antigo; vazio se a
     * propriedade não é do usuário ou não tem metas.
     */
    async list(userId: string, query: unknown): Promise<{ items: GoalProgressResponse[] }> {
        const { propertyId } = parseOrThrow(goalProgressQuerySchema, query)
        const goals = await this.goalRepository.findAllByProperty(userId, propertyId)
        const firstGoal = goals[0]
        if (!firstGoal) return { items: [] }

        const now = this.now()
        const monthly = await this.consumptionReader.monthlyKwh(propertyId, firstGoal.year, now)

        const items = goals
            .map((goal) => ({
                goalId: goal.id,
                year: goal.year,
                ...computeGoalProgress({
                    year: goal.year,
                    monthlyKwh: goal.monthlyKwh,
                    realizedByMonth: monthly.forYear(goal.year),
                    now,
                }),
            }))
            .reverse()
        return { items }
    }
}
