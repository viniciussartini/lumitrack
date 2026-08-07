import { z } from "zod"
import { listDistributorQuerySchema } from "@/modules/distributor/distributor.schema.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import type { Paginated } from "@/shared/pagination.js"

// Catálogo global de distribuidoras — somente leitura. Não há mais
// create/update/delete nem noção de "dono": o catálogo é compartilhado por
// todos os usuários (ver .claude/docs/PLANO_REFORMULACAO_IOT.md, Fase 3.2).
export class DistributorService {
    constructor(private readonly distributorRepository: DistributorRepository) {}

    async findById(id: string): Promise<DistributorResponse> {
        const distributor = await this.distributorRepository.findById(id)

        if (!distributor) {
            throw new NotFoundError("Distribuidora não encontrada")
        }

        return distributor
    }

    async findAll(query: unknown): Promise<Paginated<DistributorResponse>> {
        const parsed = listDistributorQuerySchema.safeParse(query)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        return this.distributorRepository.findAll(parsed.data)
    }
}
