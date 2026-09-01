import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAreaInput, UpdateAreaInput } from "@/modules/area/area.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import {
    toPropertyResponse,
    type PropertyResponse,
} from "@/modules/property/property.repository.js"

// Tipo inferido diretamente do Prisma
type PrismaArea = NonNullable<Awaited<ReturnType<PrismaClient["area"]["findUnique"]>>>

export type AreaResponse = PrismaArea

/** Acesso a áreas de propriedade persistidas. */
export class AreaRepository {
    /** @param prisma - Cliente Prisma para a tabela `area`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca uma área pelo id, sem checagem de posse da propriedade.
     *
     * @param id - Id da área.
     * @returns A área, ou `null` se não existir.
     */
    async findById(id: string): Promise<AreaResponse | null> {
        return this.prisma.area.findUnique({ where: { id } })
    }

    /**
     * Resolve área + propriedade dona numa única query, em vez dos 2 round
     * trips sequenciais que `resolveRootProperty` fazia antes —
     * `relationLoadStrategy: "join"` força um SQL JOIN real (a estratégia
     * default do Prisma para `include` é executar uma query por nível de
     * relação, não um join). `Area.propertyId` é FK obrigatória, então a
     * única falha possível aqui é a própria área não existir.
     *
     * @param id - Id da área.
     * @returns A área com a propriedade dona, ou `null` se a área não existir.
     */
    async findByIdWithProperty(
        id: string,
    ): Promise<{ area: AreaResponse; property: PropertyResponse } | null> {
        const raw = await this.prisma.area.findUnique({
            where: { id },
            include: { property: true },
            relationLoadStrategy: "join",
        })
        if (!raw) return null

        const { property, ...area } = raw
        return { area, property: toPropertyResponse(property) }
    }

    /**
     * Todas as áreas de uma propriedade, sem paginação.
     *
     * @param propertyId - Id da propriedade dona.
     * @returns Todas as áreas da propriedade.
     */
    async findAllByProperty(propertyId: string): Promise<AreaResponse[]> {
        return this.prisma.area.findMany({
            where: { propertyId },
            orderBy: { name: "asc" },
        })
    }

    /**
     * Lista paginada das áreas de uma propriedade.
     *
     * @param propertyId - Id da propriedade dona.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de áreas da propriedade.
     */
    async findAllByPropertyPaginated(
        propertyId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<AreaResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [areas, total] = await Promise.all([
            this.prisma.area.findMany({
                where: { propertyId },
                orderBy: { name: "asc" },
                skip,
                take,
            }),
            this.prisma.area.count({ where: { propertyId } }),
        ])

        return { items: areas, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Todas as áreas de todas as propriedades de um usuário — usado pela
     * exportação de dados do titular (LGPD, Art. 18): resolve direto via
     * filtro de relação aninhada, sem precisar buscar as properties primeiro.
     *
     * @param userId - Id do usuário dono das propriedades.
     * @returns Todas as áreas do usuário.
     */
    async findAllByUser(userId: string): Promise<AreaResponse[]> {
        return this.prisma.area.findMany({
            where: { property: { userId } },
            orderBy: { name: "asc" },
        })
    }

    /**
     * Cria uma área numa propriedade.
     *
     * @param propertyId - Id da propriedade dona.
     * @param data - Dados já validados da área.
     * @returns A área criada.
     */
    async create(propertyId: string, data: CreateAreaInput): Promise<AreaResponse> {
        return this.prisma.area.create({
            data: {
                propertyId,
                name: data.name,
                description: data.description ?? null,
            },
        })
    }

    /**
     * Atualiza uma área, ignorando campos `undefined` do input.
     *
     * @param id - Id da área.
     * @param data - Campos já validados a atualizar.
     * @returns A área atualizada.
     */
    async update(id: string, data: UpdateAreaInput): Promise<AreaResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.area.update({
            where: { id },
            data: cleanData,
        })
    }

    /**
     * Remove uma área.
     *
     * @param id - Id da área.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.area.delete({ where: { id } })
    }
}
