import { listDistributorQuerySchema } from "@/modules/distributor/distributor.schema.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"

/**
 * Catálogo global de distribuidoras — somente leitura. Não há
 * create/update/delete nem noção de "dono": o catálogo é compartilhado por
 * todos os usuários.
 */
export class DistributorService {
    /** @param distributorRepository - Acesso ao catálogo de distribuidoras persistido. */
    constructor(private readonly distributorRepository: DistributorRepository) {}

    /**
     * Busca uma distribuidora do catálogo por id.
     *
     * @param id - Id da distribuidora.
     * @returns Distribuidora encontrada.
     */
    async findById(id: string): Promise<DistributorResponse> {
        const distributor = await this.distributorRepository.findById(id)

        if (!distributor) {
            throw new NotFoundError("Distribuidora não encontrada")
        }

        return distributor
    }

    /**
     * Lista paginada do catálogo de distribuidoras.
     *
     * @param query - Query string bruta (paginação), validada aqui.
     * @returns Página de distribuidoras.
     */
    async findAll(query: unknown): Promise<Paginated<DistributorResponse>> {
        const data = parseOrThrow(listDistributorQuerySchema, query)

        return this.distributorRepository.findAll(data)
    }
}
