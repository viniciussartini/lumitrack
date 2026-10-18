import { PrismaClient } from "@/generated/prisma/client.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"

type PrismaAlertTriggerEvent = NonNullable<
    Awaited<ReturnType<PrismaClient["alertTriggerEvent"]["findUnique"]>>
>

export type AlertTriggerEventResponse = PrismaAlertTriggerEvent

export type AlertTriggerEventWithAlert = PrismaAlertTriggerEvent & {
    alert: { name: string; referencePowerKw: number; tolerancePercent: number }
}

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
                orderBy: [{ startedAt: "desc" }, { id: "desc" }],
                skip,
                take,
            }),
            this.prisma.alertTriggerEvent.count({ where: { alertId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Episódios iniciados numa janela, entre todos os alertas de um medidor,
     * do mais antigo ao mais recente — insumo do relatório de alertas.
     *
     * @param meterId - Id do medidor dos alertas.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (exclusive).
     * @param limit - Máximo de episódios devolvidos.
     * @returns Os episódios, cada um com o nome e a faixa do alerta.
     */
    async findByMeterAndPeriod(
        meterId: string,
        from: Date,
        to: Date,
        limit: number,
    ): Promise<AlertTriggerEventWithAlert[]> {
        return this.prisma.alertTriggerEvent.findMany({
            where: { alert: { meterId }, startedAt: { gte: from, lt: to } },
            include: {
                alert: { select: { name: true, referencePowerKw: true, tolerancePercent: true } },
            },
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
            take: limit,
        })
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
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.alertTriggerEvent.deleteMany({
                where: { createdAt: { lt: threshold } },
            })
            return result.count
        })
    }
}
