import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAreaInput, UpdateAreaInput } from "@/modules/area/area.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

// Tipo inferido diretamente do Prisma
type PrismaArea = NonNullable<
    Awaited<ReturnType<PrismaClient["area"]["findUnique"]>>
>

export type AreaResponse = PrismaArea

export class AreaRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<AreaResponse | null> {
        return this.prisma.area.findUnique({ where: { id } })
    }

    async findAllByProperty(propertyId: string): Promise<AreaResponse[]> {
        return this.prisma.area.findMany({
            where: { propertyId },
            orderBy: { name: "asc" },
        })
    }

    async findAllByPropertyPaginated(propertyId: string, pagination: PaginationQuery): Promise<Paginated<AreaResponse>> {
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

    // Usado pela exportação de dados do titular (#09) — resolve direto via
    // filtro de relação aninhada, sem precisar buscar as properties primeiro.
    async findAllByUser(userId: string): Promise<AreaResponse[]> {
        return this.prisma.area.findMany({
            where: { property: { userId } },
            orderBy: { name: "asc" },
        })
    }

    async create(propertyId: string, data: CreateAreaInput): Promise<AreaResponse> {
        return this.prisma.area.create({
            data: {
                propertyId,
                name: data.name,
                description: data.description ?? null,
            },
        })
    }

    async update(id: string, data: UpdateAreaInput): Promise<AreaResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.area.update({
            where: { id },
            data: cleanData,
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.area.delete({ where: { id } })
    }
}