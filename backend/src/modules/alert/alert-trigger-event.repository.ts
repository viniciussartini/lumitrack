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

// Histórico de episódios de disparo — persistido no FIM do episódio pelo
// AlertEvaluator (ver alert-evaluator.ts).
export class AlertTriggerEventRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(data: CreateAlertTriggerEventInput): Promise<AlertTriggerEventResponse> {
        return this.prisma.alertTriggerEvent.create({ data })
    }

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
     * Expurgo por retenção (Fase 15, issue #267) — remove episódios
     * persistidos há mais tempo que `threshold`, por `createdAt` (o episódio
     * já está encerrado quando é criado; não há estado "ativo/inativo"
     * separado a considerar, ao contrário de token/reset).
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        const result = await this.prisma.alertTriggerEvent.deleteMany({
            where: { createdAt: { lt: threshold } },
        })
        return result.count
    }
}
