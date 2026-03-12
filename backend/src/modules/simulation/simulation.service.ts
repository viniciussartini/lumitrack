import { z } from "zod"
import { simulationInputSchema } from "@/modules/simulation/simulation.schema.js"
import type { SimulationInput, SimulationResult } from "@/modules/simulation/simulation.schema.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const PROJECTED_DAYS: Record<"DAILY" | "MONTHLY" | "ANNUAL", number> = {
    DAILY: 1,
    MONTHLY: 30,
    ANNUAL: 365,
}

export class SimulationService {
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    async simulate(propertyId: string, userId: string, input: unknown): Promise<SimulationResult> {
        const parsed = simulationInputSchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        const kwhPrice = await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        await this.validateTarget(data, propertyId)
        const effectivePowerWatts = await this.resolveEffectivePowerWatts(data)

        const projectedDays = PROJECTED_DAYS[data.period]
        const kwhConsumed = this.calculateKwh(data, effectivePowerWatts, projectedDays)
        const costBrl = kwhConsumed * kwhPrice

        return {
            period: data.period,
            target: data.target,
            inputMode: data.inputMode,
            powerWatts: data.inputMode === "WATTS_HOURS" ? (effectivePowerWatts ?? null) : null,
            dailyUsageHours: data.inputMode === "WATTS_HOURS" ? data.dailyUsageHours : null,
            kwhConsumed,
            costBrl,
            kwhPrice,
            projectedDays,
        }
    }

    private async validatePropertyAndGetKwhPrice(propertyId: string, userId: string): Promise<number> {
        const property = await this.propertyRepository.findById(propertyId)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const distributor = await this.distributorRepository.findById(property.distributorId)

        if (!distributor) {
            throw new NotFoundError("Distribuidora vinculada não encontrada")
        }

        return distributor.kwhPrice
    }


    // Valida a cadeia de posse conforme o tipo de target escolhido.
    //   area → property ✓
    //   device → area ✓

    private async validateTarget(data: SimulationInput, propertyId: string): Promise<void> {
        if (data.target.type === "PROPERTY") {
            return
        }

        if (data.target.type === "AREA") {
            const area = await this.areaRepository.findById(data.target.areaId)

            if (!area) {
                throw new NotFoundError("Área não encontrada")
            }

            if (area.propertyId !== propertyId) {
                throw new ForbiddenError("Área não pertence a esta propriedade")
            }

            return
        }

        if (data.target.type === "DEVICE") {
            const area = await this.areaRepository.findById(data.target.areaId)

            if (!area) {
                throw new NotFoundError("Área não encontrada")
            }

            if (area.propertyId !== propertyId) {
                throw new ForbiddenError("Área não pertence a esta propriedade")
            }

            const device = await this.deviceRepository.findById(data.target.deviceId)

            if (!device) {
                throw new NotFoundError("Dispositivo não encontrado")
            }

            if (device.areaId !== data.target.areaId) {
                throw new ForbiddenError("Dispositivo não pertence a esta área")
            }
        }
    }


    // Para modo WATTS_HOURS + target DEVICE:
    //   - Se o body informa powerWatts → usa o do body (simulação hipotética)
    //   - Se o body não informa → usa o powerWatts cadastrado no device
    //   - Se nenhum dos dois está disponível → ValidationError
    //
    // Para outros targets → usa o do body diretamente (ou null para KWH_DIRECT)

    private async resolveEffectivePowerWatts(data: SimulationInput): Promise<number | null> {
        if (data.inputMode !== "WATTS_HOURS") {
            return null
        }

        if (data.powerWatts !== undefined) {
            return data.powerWatts
        }

        if (data.target.type === "DEVICE") {
            const device = await this.deviceRepository.findById(data.target.deviceId)

            if (device?.powerWatts) {
                return device.powerWatts
            }

            throw new ValidationError(
                "powerWatts não informado e dispositivo não possui potência cadastrada",
            )
        }

        throw new ValidationError(
            "powerWatts é obrigatório para simulação em modo WATTS_HOURS",
        )
    }


    // ─── Cálculo de kWh ───────────────────────────────────────────────────────
    // Modo KWH_DIRECT: kWh já informado → projeta para o período
    //   Fórmula: kwhConsumed (direto, já é o total do período)
    //
    // Modo WATTS_HOURS: calcula a partir de potência e uso diário
    //   Fórmula: (powerWatts / 1000) × dailyUsageHours × projectedDays

    private calculateKwh(data: SimulationInput, effectivePowerWatts: number | null, projectedDays: number): number {
        if (data.inputMode === "KWH_DIRECT") {
            return data.kwhConsumed
        }

        const watts = effectivePowerWatts!
        return (watts / 1000) * data.dailyUsageHours * projectedDays
    }
}