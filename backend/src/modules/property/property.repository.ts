import {
    PrismaClient,
    type ElectricalSystemType,
    type BillingClass,
    type TariffGroup,
    type TariffSubgroup,
    type TariffModality,
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

// Campos de grupo tarifário já resolvidos e validados pelo PropertyService
// (regra cruzada de RF25/ADR-0019) — `null` explícito, nunca `undefined`,
// porque para GROUP_A/GROUP_B o valor de cada campo é sempre determinado
// (aplicável com valor, ou inaplicável e limpo).
export type ResolvedTariffGroupFields = {
    billingClass: BillingClass | null
    tariffSubgroup: TariffSubgroup | null
    tariffModality: TariffModality | null
}

/**
 * Decifra os 4 campos de endereço antes de retornar ao service/controller.
 * A cifra/decifra acontece exclusivamente nessa borda do repository —
 * o resto da aplicação (service, controller, frontend) continua recebendo
 * o valor em texto claro, sem nenhuma mudança de contrato de API.
 * Exportada para uso por AreaRepository/DeviceRepository, que também
 * precisam devolver uma Property decifrada ao resolver a cadeia de posse
 * numa única query (ver `findByIdWithProperty`).
 *
 * @param p - Registro de imóvel como vem do Prisma, com endereço cifrado.
 * @returns O imóvel com os campos de endereço decifrados.
 */
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

/** Acesso a imóveis persistidos — decifra o endereço na borda antes de devolver ao chamador. */
export class PropertyRepository {
    /** @param prisma - Cliente Prisma usado para acessar a tabela de imóveis. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um imóvel pelo id, sem restringir por dono — a checagem de
     * ownership é responsabilidade do chamador.
     *
     * @param id - Id do imóvel.
     * @returns O imóvel decifrado, ou `null` se não existir.
     */
    async findById(id: string): Promise<PropertyResponse | null> {
        const property = await this.prisma.property.findUnique({ where: { id } })
        return property && toPropertyResponse(property)
    }

    /**
     * Lista todos os imóveis de um usuário, sem paginação.
     *
     * @param userId - Id do usuário dono dos imóveis.
     * @returns Todos os imóveis do usuário, ordenados por nome.
     */
    async findAllByUser(userId: string): Promise<PropertyResponse[]> {
        const properties = await this.prisma.property.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        })
        return properties.map(toPropertyResponse)
    }

    /**
     * Lista paginada dos imóveis de um usuário.
     *
     * @param userId - Id do usuário dono dos imóveis.
     * @param pagination - Página e tamanho de página solicitados.
     * @returns Página de imóveis do usuário, ordenados por nome.
     */
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

    /**
     * Cria um imóvel, cifrando os campos de endereço antes de persistir.
     *
     * @param userId - Id do usuário dono do imóvel.
     * @param data - Dados do imóvel a criar, já validados.
     * @param tariffGroupFields - Classe/subgrupo/modalidade já resolvidos e validados pelo PropertyService (RF25/ADR-0019).
     * @returns O imóvel criado, decifrado.
     */
    async create(
        userId: string,
        data: CreatePropertyInput,
        tariffGroupFields: ResolvedTariffGroupFields,
    ): Promise<PropertyResponse> {
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
                tariffGroup: data.tariffGroup as TariffGroup,
                billingClass: tariffGroupFields.billingClass,
                tariffSubgroup: tariffGroupFields.tariffSubgroup,
                tariffModality: tariffGroupFields.tariffModality,
                publicLightingFeeBrl: data.publicLightingFeeBrl ?? null,
            },
        })
        return toPropertyResponse(property)
    }

    /**
     * Atualiza um imóvel, cifrando os campos de endereço informados antes
     * de persistir.
     *
     * @param id - Id do imóvel a atualizar.
     * @param data - Campos a atualizar, já validados.
     * @param tariffGroupFields - Classe/subgrupo/modalidade já resolvidos e validados pelo PropertyService (RF25/ADR-0019), só quando a requisição toca algum desses campos — omitido, os 3 ficam como estavam.
     * @returns O imóvel atualizado, decifrado.
     */
    async update(
        id: string,
        data: UpdatePropertyInput,
        tariffGroupFields?: ResolvedTariffGroupFields,
    ): Promise<PropertyResponse> {
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
            data: {
                ...nonAddressFields,
                ...encryptedFields,
                // Sobrescreve o que veio de nonAddressFields para os 3 campos:
                // o valor já resolvido/validado pelo service é sempre o que vale.
                ...(tariffGroupFields && {
                    billingClass: tariffGroupFields.billingClass,
                    tariffSubgroup: tariffGroupFields.tariffSubgroup,
                    tariffModality: tariffGroupFields.tariffModality,
                }),
            },
        })
        return toPropertyResponse(property)
    }

    /**
     * Remove um imóvel definitivamente.
     *
     * @param id - Id do imóvel a remover.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.property.delete({ where: { id } })
    }
}
