import { updateTariffFlagSchema } from "@/modules/tariff-flag/tariff-flag.schema.js"
import type {
    TariffFlagRepository,
    TariffFlagConfigResponse,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import type { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

export class TariffFlagService {
    constructor(
        private readonly tariffFlagRepository: TariffFlagRepository,
        private readonly tariffFlagHistoryRepository: TariffFlagHistoryRepository,
    ) {}

    async get(): Promise<TariffFlagConfigResponse> {
        const config = await this.tariffFlagRepository.get()

        if (!config) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }

        return config
    }

    // actorUserId: admin autenticado responsável pela troca — gravado no
    // histórico junto do config antes/depois. Nunca nulo aqui: só
    // chega autenticado (requireRole("ADMIN") em tariff-flag.routes.ts).
    async update(input: unknown, actorUserId: string): Promise<TariffFlagConfigResponse> {
        const data = parseOrThrow(updateTariffFlagSchema, input)

        const current = await this.get()
        const updated = await this.tariffFlagRepository.update(data)

        await this.tariffFlagHistoryRepository.create({
            previousFlag: current.currentFlag,
            newFlag: updated.currentFlag,
            previousValues: {
                greenPer100Kwh: current.greenPer100Kwh,
                yellowPer100Kwh: current.yellowPer100Kwh,
                redP1Per100Kwh: current.redP1Per100Kwh,
                redP2Per100Kwh: current.redP2Per100Kwh,
            },
            newValues: {
                greenPer100Kwh: updated.greenPer100Kwh,
                yellowPer100Kwh: updated.yellowPer100Kwh,
                redP1Per100Kwh: updated.redP1Per100Kwh,
                redP2Per100Kwh: updated.redP2Per100Kwh,
            },
            source: "MANUAL",
            changedByUserId: actorUserId,
        })

        return updated
    }
}
