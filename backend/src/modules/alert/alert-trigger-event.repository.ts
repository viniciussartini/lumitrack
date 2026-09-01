import { PrismaClient } from "@/generated/prisma/client.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaAlertTriggerEvent = NonNullable<
    Awaited<ReturnType<PrismaClient["alertTriggerEvent"]["findUnique"]>>
>

export type AlertTriggerEventResponse = PrismaAlertTriggerEvent

export type CreateAlertTriggerEventInput = {
    alertId: string
    startedAt: Date
    endedAt: Date
    durationSeconds: number
    minPowerW: number
    maxPowerW: number
    avgPowerW: number
    sampleCount: number
}

/**
 * Acesso ao histórico de episódios de disparo — persistido no FIM do
 * episódio pelo `AlertEvaluator` (ver `alert-evaluator.ts`).
 */
export class AlertTriggerEventRepository {
    /** @param prisma - Cliente Prisma para a tabela `alertTriggerEvent`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Persiste um episódio de disparo encerrado.
     *
     * @param data - Dados agregados do episódio.
     * @returns O episódio criado.
     */
    async create(data: CreateAlertTriggerEventInput): Promise<AlertTriggerEventResponse> {
        return this.prisma.alertTriggerEvent.create({ data })
    }

    /**
     * Histórico paginado de episódios de disparo de um alerta, mais
     * recentes primeiro.
     *
     * @param alertId - Id do alerta.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de episódios de disparo do alerta.
     */
    async findAllByAlertPaginated(
        alertId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<AlertTriggerEventResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.alertTriggerEvent.findMany({
                where: { alertId },
                orderBy: { startedAt: "desc" },
                skip,
                take,
            }),
            this.prisma.alertTriggerEvent.count({ where: { alertId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Expurgo por retenção — remove episódios persistidos há mais tempo que
     * `threshold`, por `createdAt` (o episódio já está encerrado quando é
     * criado; não há estado "ativo/inativo" separado a considerar, ao
     * contrário de token/reset).
     *
     * @param threshold - Data limite; episódios criados antes dela são removidos.
     * @returns Quantidade de episódios removidos.
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        const result = await this.prisma.alertTriggerEvent.deleteMany({
            where: { createdAt: { lt: threshold } },
        })
        return result.count
    }
}
