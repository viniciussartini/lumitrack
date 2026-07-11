import { PrismaClient } from "@/generated/prisma/client.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

// Campos Decimal do Prisma são retornados como objetos Decimal.js, não como
// number. Convertemos para number aqui no repository para que o resto da
// aplicação (service, controller, JSON response, TariffService) trabalhe com
// tipos JavaScript nativos.

export type DistributorResponse = {
    id: string
    name: string
    cnpj: string
    state: string
    tusdPerKwh: number
    tePerKwh: number
    icmsRate: number
    pisRate: number
    cofinsRate: number
    createdAt: Date
    updatedAt: Date
}

// Infere o tipo bruto do Prisma diretamente via ReturnType — sem descrever
// manualmente { toNumber(): number }. Quando o schema mudar e `prisma generate`
// for rodado, esse tipo se atualiza automaticamente junto com o client.
type PrismaDistributor = NonNullable<
    Awaited<ReturnType<PrismaClient["energyDistributor"]["findUnique"]>>
>

function toDistributorResponse(raw: PrismaDistributor): DistributorResponse {
    return {
        id: raw.id,
        name: raw.name,
        cnpj: raw.cnpj,
        state: raw.state,
        tusdPerKwh: raw.tusdPerKwh.toNumber(),
        tePerKwh: raw.tePerKwh.toNumber(),
        icmsRate: raw.icmsRate.toNumber(),
        pisRate: raw.pisRate.toNumber(),
        cofinsRate: raw.cofinsRate.toNumber(),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }
}

// Catálogo global de distribuidoras (somente leitura, populado via seed) —
// não há mais create/update/delete nem escopo por userId.
export class DistributorRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<DistributorResponse | null> {
        const raw = await this.prisma.energyDistributor.findUnique({ where: { id } })
        return raw ? toDistributorResponse(raw) : null
    }

    async findAll(pagination: PaginationQuery): Promise<Paginated<DistributorResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [rows, total] = await Promise.all([
            this.prisma.energyDistributor.findMany({
                orderBy: { name: "asc" },
                skip,
                take,
            }),
            this.prisma.energyDistributor.count(),
        ])

        return {
            items: rows.map(toDistributorResponse),
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
        }
    }

    // Busca em lote por ID, sem paginação — usado internamente (ex.: pela
    // exportação LGPD, para resolver os nomes das distribuidoras vinculadas
    // às propriedades do titular) e nunca exposto via HTTP.
    async findAllByIds(ids: string[]): Promise<DistributorResponse[]> {
        if (ids.length === 0) return []

        const rows = await this.prisma.energyDistributor.findMany({
            where: { id: { in: ids } },
        })
        return rows.map(toDistributorResponse)
    }

    // Usado pelo service de propriedade para validar que o distributorId
    // informado existe no catálogo antes de vincular.
    async exists(id: string): Promise<boolean> {
        const count = await this.prisma.energyDistributor.count({ where: { id } })
        return count > 0
    }
}
