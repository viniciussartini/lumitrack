import { PrismaClient, type AclSubmarket } from "@/generated/prisma/client.js"
import type { ListPldQuoteQuery } from "@/modules/pld-quote/pld-quote.schema.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"

type PrismaPldQuote = NonNullable<Awaited<ReturnType<PrismaClient["pldQuote"]["findUnique"]>>>

// valuePerMwh é Decimal no Prisma — convertido para number aqui no
// repository, mesmo padrão usado por Distributor/Property/AclContract.
export type PldQuoteResponse = Omit<PrismaPldQuote, "valuePerMwh"> & {
    valuePerMwh: number
}

function toPldQuoteResponse(raw: PrismaPldQuote): PldQuoteResponse {
    return { ...raw, valuePerMwh: raw.valuePerMwh.toNumber() }
}

/**
 * Catálogo global de PLD por submercado (somente leitura, populado via
 * seed) — sem noção de dono, compartilhado por todos os usuários.
 */
export class PldQuoteRepository {
    /** @param prisma - Cliente Prisma para a tabela `pld_quotes`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Lista paginada do catálogo, mais recente primeiro, opcionalmente
     * filtrada por submercado e por uma janela do período de referência.
     *
     * @param query - Filtros e paginação já validados.
     * @returns Página de cotações de PLD.
     */
    async findAllPaginated(query: ListPldQuoteQuery): Promise<Paginated<PldQuoteResponse>> {
        const { skip, take } = toSkipTake(query)
        const where = {
            ...(query.submarket && { submarket: query.submarket }),
            ...((query.from || query.to) && {
                referencePeriod: {
                    ...(query.from && { gte: query.from }),
                    ...(query.to && { lte: query.to }),
                },
            }),
        }

        const [items, total] = await Promise.all([
            this.prisma.pldQuote.findMany({
                where,
                orderBy: { referencePeriod: "desc" },
                skip,
                take,
            }),
            this.prisma.pldQuote.count({ where }),
        ])

        return {
            items: items.map(toPldQuoteResponse),
            total,
            page: query.page,
            pageSize: query.pageSize,
        }
    }

    /**
     * Cotações de um ou mais submercados dentro de uma janela do período de
     * referência, sem paginação — uso interno (composição da comparação
     * ACR × ACL, contexto informativo do PLD), não uma listagem exposta ao
     * usuário. Mesmo padrão não paginado de
     * `AclContractRepository.findOverlappingForProperty`.
     *
     * @param submarkets - Submercados a incluir.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (inclusive).
     * @returns Cotações do período, mais recente primeiro.
     */
    async findBySubmarketsInRange(
        submarkets: AclSubmarket[],
        from: Date,
        to: Date,
    ): Promise<PldQuoteResponse[]> {
        if (submarkets.length === 0) return []

        const quotes = await this.prisma.pldQuote.findMany({
            where: {
                submarket: { in: submarkets },
                referencePeriod: { gte: from, lte: to },
            },
            orderBy: { referencePeriod: "desc" },
        })
        return quotes.map(toPldQuoteResponse)
    }
}
