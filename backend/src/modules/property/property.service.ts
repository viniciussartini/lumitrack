import { z } from "zod"
import { createPropertySchema, updatePropertySchema } from "@/modules/property/property.schema.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { NotFoundError, ForbiddenError, ValidationError } from "@/shared/errors/AppError.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

export class PropertyService {
    constructor(
        private readonly propertyRepository: PropertyRepository,
        // DistributorRepository é injetado para validar que o distributorId
        // informado existe no catálogo global (distribuidora não tem dono —
        // é um catálogo somente leitura compartilhado).
        private readonly distributorRepository: DistributorRepository,
    ) {}

    private async validateDistributorExists(distributorId: string): Promise<void> {
        const exists = await this.distributorRepository.exists(distributorId)

        if (!exists) {
            throw new NotFoundError("Distribuidora não encontrada")
        }
    }

    async create(userId: string, input: unknown): Promise<PropertyResponse> {
        const parsed = createPropertySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        await this.validateDistributorExists(data.distributorId)

        return this.propertyRepository.create(userId, data)
    }

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

    async findAll(userId: string, query: unknown): Promise<Paginated<PropertyResponse>> {
        const parsed = paginationQuerySchema.safeParse(query)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        return this.propertyRepository.findAllByUserPaginated(userId, parsed.data)
    }

    async update(id: string, requestingUserId: string, input: unknown): Promise<PropertyResponse> {
        await this.findById(id, requestingUserId)

        const parsed = updatePropertySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        if (data.distributorId !== undefined) {
            await this.validateDistributorExists(data.distributorId)
        }

        return this.propertyRepository.update(id, data)
    }

    async delete(id: string, requestingUserId: string): Promise<void> {
        await this.findById(id, requestingUserId)
        await this.propertyRepository.delete(id)
    }
}
