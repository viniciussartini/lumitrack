import { createAreaSchema, updateAreaSchema } from "@/modules/area/area.schema.js"
import type { AreaRepository, AreaResponse } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

/** CRUD de áreas — cada área pertence a uma propriedade, cuja posse é sempre validada antes de qualquer operação. */
export class AreaService {
    /**
     * @param areaRepository - Acesso a áreas persistidas.
     * @param propertyRepository - Usado para verificar posse da propriedade antes de qualquer operação sobre as áreas dela.
     */
    constructor(
        private readonly areaRepository: AreaRepository,
        private readonly propertyRepository: PropertyRepository,
    ) {}

    // Verifica que a propriedade existe e pertence ao usuário.
    private async validatePropertyOwnership(propertyId: string, userId: string): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
    }

    /**
     * Cria uma área na propriedade informada, validando a posse antes.
     *
     * @param propertyId - Id da propriedade dona.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns A área criada.
     */
    async create(propertyId: string, userId: string, input: unknown): Promise<AreaResponse> {
        await this.validatePropertyOwnership(propertyId, userId)
        const data = parseOrThrow(createAreaSchema, input)

        return this.areaRepository.create(propertyId, data)
    }

    /**
     * Detalhe de uma área da propriedade do titular.
     *
     * @param id - Id da área.
     * @param propertyId - Id da propriedade dona.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @returns A área.
     */
    async findById(id: string, propertyId: string, userId: string): Promise<AreaResponse> {
        await this.validatePropertyOwnership(propertyId, userId)
        const area = await this.areaRepository.findById(id)

        if (!area) {
            throw new NotFoundError("Área não encontrada")
        }

        if (area.propertyId !== propertyId) {
            throw new NotFoundError("Área não encontrada")
        }

        return area
    }

    /**
     * Lista paginada das áreas da propriedade do titular.
     *
     * @param propertyId - Id da propriedade dona.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de áreas da propriedade.
     */
    async findAll(
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<Paginated<AreaResponse>> {
        await this.validatePropertyOwnership(propertyId, userId)

        const data = parseOrThrow(paginationQuerySchema, query)

        return this.areaRepository.findAllByPropertyPaginated(propertyId, data)
    }

    /**
     * Atualiza uma área da propriedade do titular.
     *
     * @param id - Id da área.
     * @param propertyId - Id da propriedade dona.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns A área atualizada.
     */
    async update(
        id: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<AreaResponse> {
        await this.findById(id, propertyId, userId)
        const data = parseOrThrow(updateAreaSchema, input)

        return this.areaRepository.update(id, data)
    }

    /**
     * Remove uma área da propriedade do titular.
     *
     * @param id - Id da área.
     * @param propertyId - Id da propriedade dona.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     */
    async delete(id: string, propertyId: string, userId: string): Promise<void> {
        await this.findById(id, propertyId, userId)
        await this.areaRepository.delete(id)
    }
}
