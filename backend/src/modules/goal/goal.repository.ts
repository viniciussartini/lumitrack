import { Prisma, type Goal, type PrismaClient } from "@/generated/prisma/client.js"
import type { CreateGoalBody, UpdateGoalBody } from "@/modules/goal/goal.schema.js"
import {
    toPaginated,
    toSkipTake,
    type Paginated,
    type PaginationQuery,
} from "@/shared/pagination.js"

export type GoalRecord = Goal

/** Código do Prisma para violação de índice único. */
const UNIQUE_VIOLATION = "P2002"

/** Acesso à tabela `goals` — metas anuais de consumo de uma propriedade. */
export class GoalRepository {
    /** @param prisma - Cliente Prisma do processo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Cria uma meta.
     *
     * @param userId - Dono da meta.
     * @param data - Corpo já validado.
     * @returns A meta criada, ou `null` se a propriedade já tem meta nesse ano.
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
     * lista vazia. O ano é único por propriedade, então a ordem já é total
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
                orderBy: { year: "desc" },
                skip,
                take,
            }),
            this.prisma.goal.count({ where }),
        ])

        return toPaginated(items, total, pagination)
    }

    /**
     * Todas as metas de uma propriedade do usuário, do ano mais antigo para o
     * mais recente. Sem paginação: o ano é único por propriedade, então são
     * no máximo uma por ano. A posse entra na própria condição.
     *
     * @param userId - Dono das metas.
     * @param propertyId - Propriedade filtrada.
     * @returns Todas as metas da propriedade; vazia se ela não é do usuário.
     */
    async findAllByProperty(userId: string, propertyId: string): Promise<GoalRecord[]> {
        return this.prisma.goal.findMany({
            where: { userId, propertyId },
            orderBy: { year: "asc" },
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
            orderBy: [{ propertyId: "asc" }, { year: "asc" }],
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
     * Substitui os valores editáveis de uma meta do usuário.
     *
     * @param id - Id da meta.
     * @param userId - Dono da meta.
     * @param data - Valores já validados; ano e propriedade não mudam.
     * @returns A meta atualizada, ou `null` se não existir ou não for do usuário.
     */
    async update(id: string, userId: string, data: UpdateGoalBody): Promise<GoalRecord | null> {
        const { count } = await this.prisma.goal.updateMany({ where: { id, userId }, data })
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
