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
    // Janela de ponta do Grupo A (RN24) — nulo até a distribuidora ter
    // valores configurados (ver ADR-0019/#381).
    peakWindowStartHour: number | null
    peakWindowEndHour: number | null
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
        peakWindowStartHour: raw.peakWindowStartHour,
        peakWindowEndHour: raw.peakWindowEndHour,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }
}

// Cache em nível de módulo (não de instância — várias rotas instanciam seu
// próprio `new DistributorRepository(prismaClient)` sobre o mesmo Postgres,
// só compartilhando estado se ele viver fora da instância) e por TTL, não
// por invalidação: ao contrário da bandeira tarifária, este catálogo não tem
// nenhum caminho de escrita em runtime (create/update/delete não existem
// nesta classe) — não há evento para amarrar a invalidação. Um TTL curto
// evita servir dado desatualizado indefinidamente se o catálogo mudar por
// seed/migração futura sem reiniciar o processo.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: DistributorResponse; cachedAt: number }>()

/**
 * Catálogo global de distribuidoras (somente leitura, populado via seed) —
 * não há mais create/update/delete nem escopo por userId.
 */
export class DistributorRepository {
    /** @param prisma - Cliente Prisma usado para consultar o catálogo de distribuidoras. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca uma distribuidora por id, servindo do cache em memória quando
     * ainda dentro do TTL.
     *
     * @param id - Id da distribuidora.
     * @returns Distribuidora encontrada, ou `null` se não existir.
     */
    async findById(id: string): Promise<DistributorResponse | null> {
        const cached = cache.get(id)
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return cached.value
        }

        const raw = await this.prisma.energyDistributor.findUnique({ where: { id } })
        if (!raw) {
            cache.delete(id)
            return null
        }

        const value = toDistributorResponse(raw)
        cache.set(id, { value, cachedAt: Date.now() })
        return value
    }

    /**
     * Lista paginada do catálogo, ordenada por nome.
     *
     * @param pagination - Página e tamanho de página desejados.
     * @returns Página de distribuidoras.
     */
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

    /**
     * Busca em lote por ID, sem paginação — usado internamente (ex.: pela
     * exportação LGPD, para resolver os nomes das distribuidoras vinculadas
     * às propriedades do titular) e nunca exposto via HTTP.
     *
     * @param ids - Ids das distribuidoras a buscar.
     * @returns Distribuidoras encontradas (sem entradas para ids inexistentes).
     */
    async findAllByIds(ids: string[]): Promise<DistributorResponse[]> {
        if (ids.length === 0) return []

        const rows = await this.prisma.energyDistributor.findMany({
            where: { id: { in: ids } },
        })
        return rows.map(toDistributorResponse)
    }

    /**
     * Usado pelo service de propriedade para validar que o distributorId
     * informado existe no catálogo antes de vincular.
     *
     * @param id - Id da distribuidora a verificar.
     * @returns `true` se a distribuidora existe no catálogo.
     */
    async exists(id: string): Promise<boolean> {
        const count = await this.prisma.energyDistributor.count({ where: { id } })
        return count > 0
    }
}

/**
 * Estado de módulo sobrevive entre testes do mesmo arquivo — sem isto, a
 * primeira leitura bem-sucedida de uma suíte "vazaria" para os testes
 * seguintes mesmo depois do `cleanDatabase()` recriar os dados. Chamado por
 * `cleanDatabase()`, não pelos arquivos de teste individualmente.
 */
export function resetDistributorCacheForTests(): void {
    cache.clear()
}
