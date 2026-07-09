import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreatePropertyInput, UpdatePropertyInput } from "@/modules/property/property.schema.js"
import { encryptAddress, decryptAddress } from "@/shared/crypto/addressEncryption.js"

// Tipo inferido diretamente do Prisma — se o schema mudar e o client
// for regenerado, esse tipo se atualiza automaticamente.
type PrismaProperty = NonNullable<
    Awaited<ReturnType<PrismaClient["property"]["findUnique"]>>
>

export type PropertyResponse = PrismaProperty

// Decifra os 4 campos de endereço antes de retornar ao service/controller.
// A cifra/decifra acontece exclusivamente nessa borda do repository —
// o resto da aplicação (service, controller, frontend) continua recebendo
// o valor em texto claro, sem nenhuma mudança de contrato de API.
function decryptAddressFields<
    T extends {
        address: string | null
        city: string | null
        state: string | null
        zipCode: string | null
    },
>(p: T): T {
    return {
        ...p,
        address: p.address ? decryptAddress(p.address) : p.address,
        city: p.city ? decryptAddress(p.city) : p.city,
        state: p.state ? decryptAddress(p.state) : p.state,
        zipCode: p.zipCode ? decryptAddress(p.zipCode) : p.zipCode,
    }
}

export class PropertyRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<PropertyResponse | null> {
        const property = await this.prisma.property.findUnique({ where: { id } })
        return property && decryptAddressFields(property)
    }

    async findAllByUser(userId: string): Promise<PropertyResponse[]> {
        const properties = await this.prisma.property.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        })
        return properties.map(decryptAddressFields)
    }

    async create(userId: string, data: CreatePropertyInput): Promise<PropertyResponse> {
        const property = await this.prisma.property.create({
            data: {
                userId,
                distributorId: data.distributorId,
                name: data.name,
                address: data.address ? encryptAddress(data.address) : null,
                city: data.city ? encryptAddress(data.city) : null,
                state: data.state ? encryptAddress(data.state) : null,
                zipCode: data.zipCode ? encryptAddress(data.zipCode) : null,
            },
        })
        return decryptAddressFields(property)
    }

    async update(id: string, data: UpdatePropertyInput): Promise<PropertyResponse> {
        // Spread condicional requerido por exactOptionalPropertyTypes: true —
        // evita sobrescrever campos existentes com undefined.
        const encryptedFields = {
            ...(data.address !== undefined && {
                address: data.address ? encryptAddress(data.address) : null,
            }),
            ...(data.city !== undefined && {
                city: data.city ? encryptAddress(data.city) : null,
            }),
            ...(data.state !== undefined && {
                state: data.state ? encryptAddress(data.state) : null,
            }),
            ...(data.zipCode !== undefined && {
                zipCode: data.zipCode ? encryptAddress(data.zipCode) : null,
            }),
        }

        const nonAddressFields = Object.fromEntries(
            Object.entries(data)
                .filter(([key]) => !["address", "city", "state", "zipCode"].includes(key))
                .filter(([, value]) => value !== undefined),
        )

        const property = await this.prisma.property.update({
            where: { id },
            data: { ...nonAddressFields, ...encryptedFields },
        })
        return decryptAddressFields(property)
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.delete({ where: { id } })
    }
}
