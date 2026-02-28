import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAreaInput, UpdateAreaInput } from "@/modules/area/area.schema.js"

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