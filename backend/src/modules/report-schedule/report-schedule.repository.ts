import type { PrismaClient, ReportSchedule } from "@/generated/prisma/client.js"
import type { CreateReportInput } from "@/modules/report/report.repository.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import type { ReportScheduleBody } from "@/modules/report-schedule/report-schedule.schema.js"

export type ReportScheduleRecord = ReportSchedule

/** Corpo validado mais a próxima execução, que o serviço calcula. */
export type ReportScheduleWrite = ReportScheduleBody & { nextRunAt: Date | null }

/** Quantas configurações vencidas uma passada do scheduler processa. */
const DUE_BATCH_SIZE = 50

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
    async create(userId: string, data: ReportScheduleWrite): Promise<ReportScheduleRecord> {
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
        data: ReportScheduleWrite,
    ): Promise<ReportScheduleRecord | null> {
        const { count } = await this.prisma.reportSchedule.updateMany({
            where: { id, userId },
            data: { ...data, failedAttempts: 0 },
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

    /**
     * Configurações ativas cuja execução já venceu, da mais antiga à mais nova.
     *
     * @param now - Instante de referência.
     * @returns Até um lote de configurações vencidas.
     */
    async findDue(now: Date): Promise<ReportScheduleRecord[]> {
        return this.prisma.reportSchedule.findMany({
            where: { active: true, nextRunAt: { lte: now } },
            orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
            take: DUE_BATCH_SIZE,
        })
    }

    /**
     * Configurações ativas sem próxima execução (anteriores ao campo).
     *
     * @returns As configurações a inicializar.
     */
    async findActiveWithoutNextRun(): Promise<ReportScheduleRecord[]> {
        return this.prisma.reportSchedule.findMany({
            where: { active: true, nextRunAt: null },
            take: DUE_BATCH_SIZE,
        })
    }

    /**
     * Define a próxima execução de uma configuração ainda sem ela.
     *
     * @param id - Id da configuração.
     * @param nextRunAt - Próxima execução.
     */
    async initializeNextRun(id: string, nextRunAt: Date): Promise<void> {
        await this.prisma.reportSchedule.updateMany({
            where: { id, active: true, nextRunAt: null },
            data: { nextRunAt },
        })
    }

    /**
     * Fecha uma execução bem-sucedida: grava o relatório no histórico e avança
     * a próxima execução na mesma transação. A condição sobre `nextRunAt`
     * garante que a execução só conta uma vez, ainda que duas passadas se
     * sobreponham; se ela já foi contada, nada é gravado.
     *
     * @param id - Id da configuração.
     * @param expectedNextRunAt - Execução que foi processada.
     * @param nextRunAt - Próxima execução.
     * @param report - Relatório enviado, com origem agendada.
     * @returns `true` se a execução foi registrada agora; `false` se já estava.
     */
    async completeRun(
        id: string,
        expectedNextRunAt: Date,
        nextRunAt: Date,
        report: CreateReportInput,
    ): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            const { count } = await tx.reportSchedule.updateMany({
                where: { id, active: true, nextRunAt: expectedNextRunAt },
                data: { nextRunAt, failedAttempts: 0 },
            })
            if (count === 0) return false

            const { content, ...metadata } = report
            await tx.report.create({
                data: { ...metadata, content: new Uint8Array(content), sizeBytes: content.length },
                select: { id: true },
            })
            return true
        })
    }

    /**
     * Conta uma falha de envio; a próxima passada tenta de novo.
     *
     * @param id - Id da configuração.
     * @returns O número de falhas acumuladas no slot, ou `null` se a configuração não existe mais.
     */
    async incrementFailedAttempts(id: string): Promise<number | null> {
        const updated = await this.prisma.reportSchedule
            .update({
                where: { id },
                data: { failedAttempts: { increment: 1 } },
                select: { failedAttempts: true },
            })
            .catch(() => null)
        return updated?.failedAttempts ?? null
    }

    /**
     * Descarta o slot atual (tentativas esgotadas) e avança para o próximo.
     *
     * @param id - Id da configuração.
     * @param expectedNextRunAt - Execução descartada.
     * @param nextRunAt - Próxima execução.
     */
    async skipRun(id: string, expectedNextRunAt: Date, nextRunAt: Date): Promise<void> {
        await this.prisma.reportSchedule.updateMany({
            where: { id, nextRunAt: expectedNextRunAt },
            data: { nextRunAt, failedAttempts: 0 },
        })
    }

    /**
     * Pausa uma configuração inexequível (alvo excluído, por exemplo).
     *
     * @param id - Id da configuração.
     */
    async pause(id: string): Promise<void> {
        await this.prisma.reportSchedule.updateMany({
            where: { id },
            data: { active: false, nextRunAt: null, failedAttempts: 0 },
        })
    }
}
