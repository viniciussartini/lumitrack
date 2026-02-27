import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreatePropertyInput, UpdatePropertyInput } from "@/modules/property/property.schema.js"

// Tipo inferido diretamente do Prisma — se o schema mudar e o client
// for regenerado, esse tipo se atualiza automaticamente.
type PrismaProperty = NonNullable<
    Awaited<ReturnType<PrismaClient["property"]["findUnique"]>>
>

export type PropertyResponse = PrismaProperty

export class PropertyRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<PropertyResponse | null> {
        return this.prisma.property.findUnique({ where: { id } })
    }

    async findAllByUser(userId: string): Promise<PropertyResponse[]> {
        return this.prisma.property.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        })
    }

    async create(userId: string, data: CreatePropertyInput): Promise<PropertyResponse> {
        return this.prisma.property.create({
            data: {
                userId,
                distributorId: data.distributorId,
                name: data.name,
                address: data.address ?? null,
                city: data.city ?? null,
                state: data.state ?? null,
                zipCode: data.zipCode ?? null,
            },
        })
    }

    async update(id: string, data: UpdatePropertyInput): Promise<PropertyResponse> {
        // Object.fromEntries filtra undefined
        // para não sobrescrever campos existentes com null inadvertidamente.
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.property.update({
            where: { id },
            data: cleanData,
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.delete({ where: { id } })
    }
}