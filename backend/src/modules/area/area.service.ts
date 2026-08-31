import { createAreaSchema, updateAreaSchema } from "@/modules/area/area.schema.js"
import type { AreaRepository, AreaResponse } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

export class AreaService {
    constructor(
        private readonly areaRepository: AreaRepository,

        // PropertyRepository injetado para verificar posse da propriedade
        // antes de qualquer operação sobre as áreas dela.
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

    async create(propertyId: string, userId: string, input: unknown): Promise<AreaResponse> {
        await this.validatePropertyOwnership(propertyId, userId)
        const data = parseOrThrow(createAreaSchema, input)

        return this.areaRepository.create(propertyId, data)
    }

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

    async findAll(
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<Paginated<AreaResponse>> {
        await this.validatePropertyOwnership(propertyId, userId)

        const data = parseOrThrow(paginationQuerySchema, query)

        return this.areaRepository.findAllByPropertyPaginated(propertyId, data)
    }

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

    async delete(id: string, propertyId: string, userId: string): Promise<void> {
        await this.findById(id, propertyId, userId)
        await this.areaRepository.delete(id)
    }
}
