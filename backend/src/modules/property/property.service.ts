import { z } from "zod"
import { createPropertySchema, updatePropertySchema } from "@/modules/property/property.schema.js"
import type { PropertyRepository, PropertyResponse } from "@/modules/property/property.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class PropertyService {
    constructor(
        private readonly propertyRepository: PropertyRepository,
        // DistributorRepository é injetado para validar posse da distribuidora.
        private readonly distributorRepository: DistributorRepository,
    ) {}

    private async validateDistributorOwnership(distributorId: string, userId: string

    ): Promise<void> {
        const distributor = await this.distributorRepository.findById(distributorId)

        if (!distributor) {
            throw new NotFoundError("Distribuidora não encontrada")
        }

        if (distributor.userId !== userId) {
            throw new ForbiddenError("A distribuidora informada não pertence a você")
        }
    }

    async create(userId: string, input: unknown): Promise<PropertyResponse> {
        const parsed = createPropertySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        await this.validateDistributorOwnership(data.distributorId, userId)

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

    async findAll(userId: string): Promise<PropertyResponse[]> {
        return this.propertyRepository.findAllByUser(userId)
    }

    async update(id: string, requestingUserId: string, input: unknown

    ): Promise<PropertyResponse> {
        await this.findById(id, requestingUserId)

        const parsed = updatePropertySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        if (data.distributorId !== undefined) {
            await this.validateDistributorOwnership(data.distributorId, requestingUserId)
        }

        return this.propertyRepository.update(id, data)
    }

    async delete(id: string, requestingUserId: string): Promise<void> {
        await this.findById(id, requestingUserId)
        await this.propertyRepository.delete(id)
    }
}