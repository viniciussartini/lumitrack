import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { computeGoalProgress, type GoalProgressSummary } from "@/modules/goal/goal-progress.js"
import { goalProgressQuerySchema } from "@/modules/goal/goal.schema.js"
import type { GoalRepository } from "@/modules/goal/goal.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

/** Acompanhamento de uma meta, com o id para a tela casá-lo com a linha do histórico. */
export type GoalProgressResponse = GoalProgressSummary & { goalId: string; year: number }

/**
 * Acompanhamento das metas de uma propriedade: o consumo mensal realizado
 * contra a meta, o desvio e a situação de cada ano. Lê os kWh direto da
 * agregação mensal de leituras — a mesma do `ConsumptionService` —, sem
 * passar pelo cálculo de custo, que nada aqui usa e que falha em tarifas
 * ainda sem apuração.
 */
export class GoalProgressService {
    /**
     * @param goalRepository - Metas da propriedade.
     * @param meterRepository - Acha o medidor da propriedade.
     * @param consumptionRepository - Agregação mensal de leituras.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly goalRepository: GoalRepository,
        private readonly meterRepository: MeterRepository,
        private readonly consumptionRepository: ConsumptionRepository,
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
        const realizedByYearMonth = await this.loadMonthlyKwh(propertyId, firstGoal.year, now)

        const items = goals
            .map((goal) => ({
                goalId: goal.id,
                year: goal.year,
                ...computeGoalProgress({
                    year: goal.year,
                    monthlyKwh: goal.monthlyKwh,
                    realizedByMonth: Array.from(
                        { length: 12 },
                        (_, month) => realizedByYearMonth.get(`${goal.year}-${month}`) ?? null,
                    ),
                    now,
                }),
            }))
            .reverse()
        return { items }
    }

    // kWh por `ano-mês` (mês de 0 a 11, hora de São Paulo) do primeiro ano com
    // meta até o fim do ano corrente. Meses sem leitura ficam fora do mapa.
    private async loadMonthlyKwh(
        propertyId: string,
        firstYear: number,
        now: Date,
    ): Promise<Map<string, number>> {
        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) return new Map()

        const currentYear = toSaoPauloLocal(now).getUTCFullYear()
        if (firstYear > currentYear) return new Map()

        const from = fromSaoPauloLocal(new Date(Date.UTC(firstYear, 0, 1)))
        const to = fromSaoPauloLocal(new Date(Date.UTC(currentYear + 1, 0, 1)))
        const { items } = await this.consumptionRepository.findAggregated({
            meterId: meter.id,
            granularity: "month",
            from,
            to,
            order: "asc",
            skip: 0,
            take: (currentYear - firstYear + 1) * 12,
        })

        // `bucketStart` é a hora de parede de São Paulo lida como se fosse UTC.
        return new Map(
            items.map((bucket) => [
                `${bucket.bucketStart.getUTCFullYear()}-${bucket.bucketStart.getUTCMonth()}`,
                bucket.kwhConsumed,
            ]),
        )
    }
}
