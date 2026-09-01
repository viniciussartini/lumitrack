import { createPropertySchema, updatePropertySchema } from "@/modules/property/property.schema.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { NotFoundError, ForbiddenError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

/** Regras de negócio de imóveis — ownership do titular e existência da distribuidora vinculada. */
export class PropertyService {
    /**
     * @param propertyRepository - Acesso a imóveis persistidos.
     * @param distributorRepository - Usado para validar que o distributorId informado existe no catálogo global (distribuidora não tem dono — é um catálogo somente leitura compartilhado).
     */
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
    ) {}

    private async validateDistributorExists(distributorId: string): Promise<void> {
        const exists = await this.distributorRepository.exists(distributorId)

        if (!exists) {
            throw new NotFoundError("Distribuidora não encontrada")
        }
    }

    /**
     * Cria um imóvel do titular, validando antes que a distribuidora
     * informada exista no catálogo.
     *
     * @param userId - Id do usuário dono do imóvel.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O imóvel criado.
     */
    async create(userId: string, input: unknown): Promise<PropertyResponse> {
        const data = parseOrThrow(createPropertySchema, input)

        await this.validateDistributorExists(data.distributorId)

        return this.propertyRepository.create(userId, data)
    }

    /**
     * Busca um imóvel garantindo que ele pertence ao usuário requisitante.
     *
     * @param id - Id do imóvel.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     * @returns O imóvel, se existir e pertencer ao requisitante.
     */
    async findById(id: string, requestingUserId: string): Promise<PropertyResponse> {
        const property = await this.propertyRepository.findById(id)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== requestingUserId) {
            throw new ForbiddenError("Acesso negado")
        }

        return property
    }

    /**
     * Lista paginada dos imóveis do titular.
     *
     * @param userId - Id do usuário dono dos imóveis.
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de imóveis do usuário.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<PropertyResponse>> {
        const data = parseOrThrow(paginationQuerySchema, query)

        return this.propertyRepository.findAllByUserPaginated(userId, data)
    }

    /**
     * Atualiza um imóvel do titular, validando ownership e, se a
     * distribuidora for trocada, que a nova distribuidora exista.
     *
     * @param id - Id do imóvel a atualizar.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O imóvel atualizado.
     */
    async update(id: string, requestingUserId: string, input: unknown): Promise<PropertyResponse> {
        await this.findById(id, requestingUserId)

        const data = parseOrThrow(updatePropertySchema, input)

        if (data.distributorId !== undefined) {
            await this.validateDistributorExists(data.distributorId)
        }

        return this.propertyRepository.update(id, data)
    }

    /**
     * Remove um imóvel do titular, validando ownership antes de excluir.
     *
     * @param id - Id do imóvel a remover.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     */
    async delete(id: string, requestingUserId: string): Promise<void> {
        await this.findById(id, requestingUserId)
        await this.propertyRepository.delete(id)
    }
}
