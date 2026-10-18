import { listPldQuoteQuerySchema } from "@/modules/pld-quote/pld-quote.schema.js"
import type {
    PldQuoteRepository,
    PldQuoteResponse,
} from "@/modules/pld-quote/pld-quote.repository.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"

/**
 * Catálogo global de PLD por submercado — somente leitura. Não há
 * create/update/delete nem noção de "dono": o catálogo é compartilhado por
 * todos os usuários, mesmo padrão de `DistributorService`.
 */
export class PldQuoteService {
    /** @param pldQuoteRepository - Acesso ao catálogo de PLD persistido. */
    constructor(private readonly pldQuoteRepository: PldQuoteRepository) {}

    /**
     * Lista paginada do catálogo de PLD, opcionalmente filtrada por
     * submercado e por uma janela do período de referência.
     *
     * @param query - Query string bruta (filtros e paginação), validada aqui.
     * @returns Página de cotações de PLD.
     */
    async findAll(query: unknown): Promise<Paginated<PldQuoteResponse>> {
        const data = parseOrThrow(listPldQuoteQuerySchema, query)

        return this.pldQuoteRepository.findAllPaginated(data)
    }
}
