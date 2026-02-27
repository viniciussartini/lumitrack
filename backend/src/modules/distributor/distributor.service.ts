import { z } from "zod"
import { createDistributorSchema, updateDistributorSchema } from "@/modules/distributor/distributor.schema.js"
import type { DistributorRepository, DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class DistributorService {
    constructor(private readonly distributorRepository: DistributorRepository) {}

    async create(userId: string, input: unknown): Promise<DistributorResponse> {
        const parsed = createDistributorSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        const existing = await this.distributorRepository.findByUserAndCnpj(userId, data.cnpj)
        if (existing) {
            throw new ConflictError("Você já cadastrou uma distribuidora com este CNPJ")
        }

        return this.distributorRepository.create(userId, data)
    }

    async findById(id: string, requestingUserId: string): Promise<DistributorResponse> {
        const distributor = await this.distributorRepository.findById(id)

        if (!distributor) {
            throw new NotFoundError("Distribuidora não encontrada")
        }

        if (distributor.userId !== requestingUserId) {
            throw new ForbiddenError("Acesso negado")
        }

        return distributor
    }

    async findAll(userId: string): Promise<DistributorResponse[]> {
        return this.distributorRepository.findAllByUser(userId)
    }

    async update(
        id: string,
        requestingUserId: string,
        input: unknown,
    ): Promise<DistributorResponse> {

        await this.findById(id, requestingUserId)

        const parsed = updateDistributorSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        return this.distributorRepository.update(id, parsed.data)
    }

    async delete(id: string, requestingUserId: string): Promise<void> {
        await this.findById(id, requestingUserId)
        const hasLinkedProperties = await this.distributorRepository.hasProperties(id)
        
        if (hasLinkedProperties) {
            throw new ConflictError(
                "Não é possível excluir uma distribuidora com propriedades vinculadas. Desvincule as propriedades primeiro.",
            )
        }

        await this.distributorRepository.delete(id)
    }
}