import {
    PrismaClient,
    type ElectricalSystemType,
    type BillingClass,
} from "@/generated/prisma/client.js"
import type {
    CreatePropertyInput,
    UpdatePropertyInput,
} from "@/modules/property/property.schema.js"
import { encryptAddress, decryptAddress } from "@/shared/crypto/addressEncryption.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

// Tipo inferido diretamente do Prisma — se o schema mudar e o client
// for regenerado, esse tipo se atualiza automaticamente.
type PrismaProperty = NonNullable<Awaited<ReturnType<PrismaClient["property"]["findUnique"]>>>

// publicLightingFeeBrl é Decimal no Prisma — convertido para number aqui no
// repository, mesmo padrão usado por Distributor/TariffFlagConfig.
export type PropertyResponse = Omit<PrismaProperty, "publicLightingFeeBrl"> & {
    publicLightingFeeBrl: number | null
}

// Decifra os 4 campos de endereço antes de retornar ao service/controller.
// A cifra/decifra acontece exclusivamente nessa borda do repository —
// o resto da aplicação (service, controller, frontend) continua recebendo
// o valor em texto claro, sem nenhuma mudança de contrato de API.
// Exportada para uso por AreaRepository/DeviceRepository, que também
// precisam devolver uma Property decifrada ao resolver a cadeia de posse
// numa única query (ver `findByIdWithProperty`).
export function toPropertyResponse(p: PrismaProperty): PropertyResponse {
    return {
        ...p,
        address: p.address ? decryptAddress(p.address) : p.address,
        city: p.city ? decryptAddress(p.city) : p.city,
        state: p.state ? decryptAddress(p.state) : p.state,
        zipCode: p.zipCode ? decryptAddress(p.zipCode) : p.zipCode,
        publicLightingFeeBrl: p.publicLightingFeeBrl?.toNumber() ?? null,
    }
}

export class PropertyRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<PropertyResponse | null> {
        const property = await this.prisma.property.findUnique({ where: { id } })
        return property && toPropertyResponse(property)
    }

    async findAllByUser(userId: string): Promise<PropertyResponse[]> {
        const properties = await this.prisma.property.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        })
        return properties.map(toPropertyResponse)
    }

    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<PropertyResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [properties, total] = await Promise.all([
            this.prisma.property.findMany({
                where: { userId },
                orderBy: { name: "asc" },
                skip,
                take,
            }),
            this.prisma.property.count({ where: { userId } }),
        ])

        return {
            items: properties.map(toPropertyResponse),
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
        }
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
                electricalSystem: data.electricalSystem as ElectricalSystemType,
                billingClass: data.billingClass as BillingClass,
                publicLightingFeeBrl: data.publicLightingFeeBrl ?? null,
            },
        })
        return toPropertyResponse(property)
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
        return toPropertyResponse(property)
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.delete({ where: { id } })
    }
}
