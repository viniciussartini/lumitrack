import { z } from "zod"
import { updateTariffFlagSchema } from "@/modules/tariff-flag/tariff-flag.schema.js"
import type { TariffFlagRepository, TariffFlagConfigResponse } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class TariffFlagService {
    constructor(private readonly tariffFlagRepository: TariffFlagRepository) {}

    async get(): Promise<TariffFlagConfigResponse> {
        const config = await this.tariffFlagRepository.get()

        if (!config) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }

        return config
    }

    async update(input: unknown): Promise<TariffFlagConfigResponse> {
        const parsed = updateTariffFlagSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        await this.get()

        return this.tariffFlagRepository.update(parsed.data)
    }
}
