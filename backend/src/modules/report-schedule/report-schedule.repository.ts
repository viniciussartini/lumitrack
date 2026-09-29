import type { PrismaClient, ReportSchedule } from "@/generated/prisma/client.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import type { ReportScheduleBody } from "@/modules/report-schedule/report-schedule.schema.js"

export type ReportScheduleRecord = ReportSchedule

/** Acesso à tabela `report_schedules` — configurações de envio automático de relatório. */
export class ReportScheduleRepository {
    /** @param prisma - Cliente Prisma do processo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Cria uma configuração de envio.
     *
     * @param userId - Dono da configuração.
     * @param data - Corpo já validado.
     * @returns A configuração criada.
     */
    async create(userId: string, data: ReportScheduleBody): Promise<ReportScheduleRecord> {
        return this.prisma.reportSchedule.create({ data: { ...data, userId } })
    }

    /**
     * Quantas configurações o usuário tem — insumo do teto por usuário.
     *
     * @param userId - Dono das configurações.
     * @returns O número de configurações do usuário.
     */
    async countByUser(userId: string): Promise<number> {
        return this.prisma.reportSchedule.count({ where: { userId } })
    }

    /**
     * Configurações do usuário, mais antigas primeiro. O `id` desempata
     * `createdAt` para a ordem ser total entre páginas.
     *
     * @param userId - Dono das configurações.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de configurações.
     */
    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<ReportScheduleRecord>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.reportSchedule.findMany({
                where: { userId },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                skip,
                take,
            }),
            this.prisma.reportSchedule.count({ where: { userId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Todas as configurações do usuário — insumo da exportação dos dados do titular.
     *
     * @param userId - Dono das configurações.
     * @returns Todas as configurações do usuário, mais antigas primeiro.
     */
    async findAllByUser(userId: string): Promise<ReportScheduleRecord[]> {
        return this.prisma.reportSchedule.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
    }

    /**
     * Substitui uma configuração do usuário. A posse entra na própria
     * condição, então configuração alheia é indistinguível de inexistente.
     *
     * @param id - Id da configuração.
     * @param userId - Dono da configuração.
     * @param data - Corpo já validado.
     * @returns A configuração atualizada, ou `null` se não existir ou não for do usuário.
     */
    async update(
        id: string,
        userId: string,
        data: ReportScheduleBody,
    ): Promise<ReportScheduleRecord | null> {
        const { count } = await this.prisma.reportSchedule.updateMany({
            where: { id, userId },
            data,
        })
        if (count === 0) return null
        return this.prisma.reportSchedule.findFirst({ where: { id, userId } })
    }

    /**
     * Exclui uma configuração do usuário.
     *
     * @param id - Id da configuração.
     * @param userId - Dono da configuração.
     * @returns `true` se uma configuração foi excluída.
     */
    async deleteByIdAndUser(id: string, userId: string): Promise<boolean> {
        const { count } = await this.prisma.reportSchedule.deleteMany({ where: { id, userId } })
        return count > 0
    }
}
