import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAlertInput, UpdateAlertInput } from "@/modules/alert/alert.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaAlert = NonNullable<
    Awaited<ReturnType<PrismaClient["alert"]["findUnique"]>>
>

export type AlertResponse = PrismaAlert

export class AlertRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<AlertResponse | null> {
        return this.prisma.alert.findUnique({ where: { id } })
    }

    async findAllByUserPaginated(userId: string, pagination: PaginationQuery): Promise<Paginated<AlertResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.alert.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            this.prisma.alert.count({ where: { userId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    // Sem paginação de propósito — usado só pela exportação LGPD (#09, Art.
    // 18), que precisa de todos os alertas do titular de uma vez.
    async findAllByUser(userId: string): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    }

    // Todos os alertas habilitados de todos os usuários — usado só pelo
    // AlertEvaluator para popular o cache (meterId → Alert[]) no boot.
    async findAllEnabled(): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { enabled: true } })
    }

    // Alertas habilitados de um medidor específico — usado pelo
    // AlertEvaluator para recarregar o cache após create/update/delete/toggle.
    async findAllEnabledByMeter(meterId: string): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { meterId, enabled: true } })
    }

    async create(userId: string, data: CreateAlertInput): Promise<AlertResponse> {
        return this.prisma.alert.create({
            data: {
                userId,
                meterId: data.meterId,
                name: data.name,
                referencePowerKw: data.referencePowerKw,
                tolerancePercent: data.tolerancePercent,
                enabled: data.enabled ?? true,
            },
        })
    }

    async update(id: string, data: UpdateAlertInput): Promise<AlertResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        return this.prisma.alert.update({ where: { id }, data: cleanData })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.alert.delete({ where: { id } })
    }
}
