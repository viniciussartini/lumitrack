import { updateTariffFlagSchema } from "@/modules/tariff-flag/tariff-flag.schema.js"
import type {
    TariffFlagRepository,
    TariffFlagConfigResponse,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import type { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

/** Configuração de bandeira tarifária vigente — consulta e atualização, com registro de histórico. */
export class TariffFlagService {
    /**
     * @param tariffFlagRepository - Acesso à configuração de bandeira tarifária persistida.
     * @param tariffFlagHistoryRepository - Acesso ao histórico de trocas de bandeira, gravado a cada atualização.
     */
    constructor(
        private readonly tariffFlagRepository: TariffFlagRepository,
        private readonly tariffFlagHistoryRepository: TariffFlagHistoryRepository,
    ) {}

    /**
     * Lê a configuração de bandeira tarifária vigente.
     *
     * @returns Configuração de bandeira tarifária vigente.
     */
    async get(): Promise<TariffFlagConfigResponse> {
        const config = await this.tariffFlagRepository.get()

        if (!config) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }

        return config
    }

    /**
     * Atualiza a configuração de bandeira tarifária e registra a troca no
     * histórico, com os valores antes e depois.
     *
     * @param input - Corpo bruto da requisição, validado aqui.
     * @param actorUserId - Id do admin autenticado responsável pela troca (nunca nulo — `requireRole("ADMIN")` já garante isso nas rotas do módulo), gravado no histórico junto do config antes/depois.
     * @returns Configuração de bandeira tarifária após a atualização.
     */
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
