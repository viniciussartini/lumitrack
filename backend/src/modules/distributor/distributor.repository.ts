import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateDistributorInput, UpdateDistributorInput } from "@/modules/distributor/distributor.schema.js"

// Campos Decimal do Prisma são retornados como objetos Decimal.js, não como number.
// Convertemos para number aqui no repository para que o resto da aplicação
// (service, controller, JSON response) trabalhe com tipos JavaScript nativos.

export type DistributorResponse = {
    id: string
    userId: string
    name: string
    cnpj: string
    electricalSystem: "MONOPHASIC" | "BIPHASIC" | "TRIPHASIC"
    workingVoltage: number
    kwhPrice: number
    taxRate: number | null
    publicLightingFee: number | null
    createdAt: Date
    updatedAt: Date
}

// Converte os campos Decimal do Prisma para number JavaScript.
// Necessário porque Prisma 7 retorna Decimal como objeto opaco com .toNumber().
function toDistributorResponse(raw: {
    id: string
    userId: string
    name: string
    cnpj: string
    electricalSystem: "MONOPHASIC" | "BIPHASIC" | "TRIPHASIC"
    workingVoltage: number
    kwhPrice: { toNumber(): number }
    taxRate: { toNumber(): number } | null
    publicLightingFee: { toNumber(): number } | null
    createdAt: Date
    updatedAt: Date
}): DistributorResponse {
    return {
        ...raw,
        kwhPrice: raw.kwhPrice.toNumber(),
        taxRate: raw.taxRate?.toNumber() ?? null,
        publicLightingFee: raw.publicLightingFee?.toNumber() ?? null,
    }
}

export class DistributorRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<DistributorResponse | null> {
        const raw = await this.prisma.energyDistributor.findUnique({ where: { id } })
        return raw ? toDistributorResponse(raw) : null
    }

    // Busca por CNPJ + userId — respeita a constraint @@unique([userId, cnpj]).
    async findByUserAndCnpj(userId: string, cnpj: string): Promise<DistributorResponse | null> {
        const raw = await this.prisma.energyDistributor.findUnique({
            where: { userId_cnpj: { userId, cnpj } },
        })
        return raw ? toDistributorResponse(raw) : null
    }

    async findAllByUser(userId: string): Promise<DistributorResponse[]> {
        const rows = await this.prisma.energyDistributor.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        })
        return rows.map(toDistributorResponse)
    }

    async create(userId: string, data: CreateDistributorInput): Promise<DistributorResponse> {
        const raw = await this.prisma.energyDistributor.create({
            data: {
                userId,
                name: data.name,
                cnpj: data.cnpj,
                electricalSystem: data.electricalSystem,
                workingVoltage: data.workingVoltage,
                kwhPrice: data.kwhPrice,
                taxRate: data.taxRate ?? null,
                publicLightingFee: data.publicLightingFee ?? null,
            },
        })
        return toDistributorResponse(raw)
    }

    async update(id: string, data: UpdateDistributorInput): Promise<DistributorResponse> {
        // Limpa undefined para não sobrescrever campos existentes com null
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        const raw = await this.prisma.energyDistributor.update({
            where: { id },
            data: cleanData,
        })
        return toDistributorResponse(raw)
    }

    async delete(id: string): Promise<void> {
        await this.prisma.energyDistributor.delete({ where: { id } })
    }
}