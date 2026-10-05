import { Prisma, type Goal, type PrismaClient } from "@/generated/prisma/client.js"
import type { CreateGoalBody, UpdateGoalBody } from "@/modules/goal/goal.schema.js"
import {
    toPaginated,
    toSkipTake,
    type Paginated,
    type PaginationQuery,
} from "@/shared/pagination.js"

export type GoalRecord = Goal

/** O que identifica uma meta numa certa versão: o id e o instante da última edição. */
export type GoalVersion = Pick<GoalRecord, "id" | "updatedAt">

/** Meta como sai da API e do export: sem o dono nem a contabilidade interna dos avisos. */
export type GoalPublicRecord = Omit<
    GoalRecord,
    "userId" | "alertNotifiedMonth" | "alertNotifiedYear"
>

/**
 * Tira do registro o que é interno: o dono e as marcas de "já avisado".
 *
 * @param record - Meta como o banco a devolve.
 * @returns A meta como a API e o export a mostram.
 */
export function toPublicGoal(record: GoalRecord): GoalPublicRecord {
    const {
        userId: _owner,
        alertNotifiedMonth: _notifiedMonth,
        alertNotifiedYear: _notifiedYear,
        ...rest
    } = record
    return rest
}

/** Meta com o nome da propriedade, para as mensagens dos avisos. */
export type GoalWithProperty = GoalRecord & { property: { name: string } }

/** Código do Prisma para violação de índice único. */
const UNIQUE_VIOLATION = "P2002"

/** Acesso à tabela `goals` — metas anuais (consumo, custo e demanda) de uma propriedade. */
export class GoalRepository {
    /** @param prisma - Cliente Prisma do processo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Cria uma meta.
     *
     * @param userId - Dono da meta.
     * @param data - Corpo já validado.
     * @returns A meta criada, ou `null` se a propriedade já tem meta nesse ano e unidade.
     */
    async create(userId: string, data: CreateGoalBody): Promise<GoalRecord | null> {
        try {
            return await this.prisma.goal.create({ data: { ...data, userId } })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_VIOLATION
            ) {
                return null
            }
            throw error
        }
    }

    /**
     * Metas de uma propriedade do usuário, do ano mais recente para o mais
     * antigo. A posse entra na própria condição, então propriedade alheia dá
     * lista vazia. O ano e a unidade são únicos por propriedade, então a ordem já é total
     * entre páginas.
     *
     * @param userId - Dono das metas.
     * @param propertyId - Propriedade filtrada.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de metas.
     */
    async findAllByPropertyPaginated(
        userId: string,
        propertyId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<GoalRecord>> {
        const { skip, take } = toSkipTake(pagination)
        const where = { userId, propertyId }

        const [items, total] = await Promise.all([
            this.prisma.goal.findMany({
                where,
                orderBy: [{ year: "desc" }, { unit: "asc" }],
                skip,
                take,
            }),
            this.prisma.goal.count({ where }),
        ])

        return toPaginated(items, total, pagination)
    }

    /**
     * Todas as metas de uma propriedade do usuário, do ano mais antigo para o
     * mais recente. Sem paginação: são no máximo três por ano (uma por
     * unidade) e o ano vai até 2100. A posse entra na própria condição.
     *
     * @param userId - Dono das metas.
     * @param propertyId - Propriedade filtrada.
     * @returns Todas as metas da propriedade; vazia se ela não é do usuário.
     */
    async findAllByProperty(userId: string, propertyId: string): Promise<GoalRecord[]> {
        return this.prisma.goal.findMany({
            where: { userId, propertyId },
            orderBy: [{ year: "asc" }, { unit: "asc" }],
        })
    }

    /**
     * Todas as metas do usuário — insumo da exportação dos dados do titular.
     *
     * @param userId - Dono das metas.
     * @returns Todas as metas do usuário, da mais antiga para a mais recente.
     */
    async findAllByUser(userId: string): Promise<GoalRecord[]> {
        return this.prisma.goal.findMany({
            where: { userId },
            orderBy: [{ propertyId: "asc" }, { year: "asc" }, { unit: "asc" }],
        })
    }

    /**
     * Uma meta do usuário. A posse entra na própria condição, então meta
     * alheia é indistinguível de inexistente.
     *
     * @param id - Id da meta.
     * @param userId - Dono da meta.
     * @returns A meta, ou `null` se não existir ou não for do usuário.
     */
    async findByIdAndUser(id: string, userId: string): Promise<GoalRecord | null> {
        return this.prisma.goal.findFirst({ where: { id, userId } })
    }

    /**
     * Metas do ano que ainda podem ter um aviso a dar neste mês: o aviso do
     * mês ou o do ano ainda não saiu. A demanda (kW) é pico e não tem aviso
     * anual, então só o do mês a mantém na lista. Insumo do avaliador periódico.
     *
     * @param year - Ano corrente.
     * @param month - Mês corrente, de 1 a 12.
     * @returns As metas pendentes, com o nome da propriedade.
     */
    async findPendingAlertGoals(year: number, month: number): Promise<GoalWithProperty[]> {
        return this.prisma.goal.findMany({
            where: {
                year,
                OR: [
                    { alertNotifiedYear: false, unit: { not: "KW" } },
                    { alertNotifiedMonth: null },
                    { alertNotifiedMonth: { not: month } },
                ],
            },
            include: { property: { select: { name: true } } },
        })
    }

    /**
     * Metas de um ano de um usuário, com o nome da propriedade, por ordem de nome.
     *
     * @param userId - Dono das metas.
     * @param year - Ano filtrado.
     * @returns As metas do ano em todas as propriedades do usuário.
     */
    async findByUserAndYear(userId: string, year: number): Promise<GoalWithProperty[]> {
        return this.prisma.goal.findMany({
            where: { userId, year },
            include: { property: { select: { name: true } } },
            orderBy: [{ property: { name: "asc" } }, { unit: "asc" }],
        })
    }

    /**
     * Reivindica o aviso do mês: grava o mês só se ele ainda não foi avisado e
     * a meta continua na versão que o avaliador leu. É um `UPDATE` condicional,
     * então de duas chamadas simultâneas só uma enxerga a linha por avisar —
     * quem recebe `true` é quem notifica —, e uma edição entre a leitura e a
     * reivindicação a invalida, para não avisar com os números da meta antiga.
     * A versão fica como está: reivindicar não é editar.
     *
     * @param goal - Id e versão (`updatedAt`) da meta, como o avaliador a leu.
     * @param month - Mês corrente, de 1 a 12.
     * @returns `true` se este chamador reivindicou o aviso.
     */
    async claimMonthAlert(goal: GoalVersion, month: number): Promise<boolean> {
        const { count } = await this.prisma.goal.updateMany({
            where: {
                id: goal.id,
                updatedAt: goal.updatedAt,
                OR: [{ alertNotifiedMonth: null }, { alertNotifiedMonth: { not: month } }],
            },
            data: { alertNotifiedMonth: month, updatedAt: goal.updatedAt },
        })
        return count > 0
    }

    /**
     * Reivindica o aviso do ano, com a mesma garantia de {@link claimMonthAlert}.
     *
     * @param goal - Id e versão (`updatedAt`) da meta, como o avaliador a leu.
     * @returns `true` se este chamador reivindicou o aviso.
     */
    async claimYearAlert(goal: GoalVersion): Promise<boolean> {
        const { count } = await this.prisma.goal.updateMany({
            where: { id: goal.id, updatedAt: goal.updatedAt, alertNotifiedYear: false },
            data: { alertNotifiedYear: true, updatedAt: goal.updatedAt },
        })
        return count > 0
    }

    /**
     * Substitui os valores editáveis de uma meta do usuário.
     *
     * @param id - Id da meta.
     * @param userId - Dono da meta.
     * @param data - Valores já validados; ano e propriedade não mudam.
     * @returns A meta atualizada, ou `null` se não existir ou não for do usuário.
     */
    async update(id: string, userId: string, data: UpdateGoalBody): Promise<GoalRecord | null> {
        // Novo limite, nova chance de aviso: as marcas de "já avisado" voltam ao zero.
        const { count } = await this.prisma.goal.updateMany({
            where: { id, userId },
            data: { ...data, alertNotifiedMonth: null, alertNotifiedYear: false },
        })
        if (count === 0) return null
        return this.prisma.goal.findFirst({ where: { id, userId } })
    }

    /**
     * Exclui uma meta do usuário.
     *
     * @param id - Id da meta.
     * @param userId - Dono da meta.
     * @returns `true` se uma meta foi excluída.
     */
    async deleteByIdAndUser(id: string, userId: string): Promise<boolean> {
        const { count } = await this.prisma.goal.deleteMany({ where: { id, userId } })
        return count > 0
    }
}
