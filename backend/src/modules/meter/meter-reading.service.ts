import { z } from "zod"
import {
    listMeterReadingsQuerySchema,
    type MeterReadingGranularity,
} from "@/modules/meter/meter-reading.schema.js"
import type {
    MeterReadingRepository,
    MeterReadingBucket,
} from "@/modules/meter/meter-reading.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export type MeterReadingListResponse = {
    items: MeterReadingBucket[]
    granularity: MeterReadingGranularity
}

// Leituras agregadas por minuto/hora — só o que o gráfico "ao vivo" precisa
// (issue #211): sem custo/tarifa, sem paginação (a janela já vem limitada
// por from/to). Ver ConsumptionService para o equivalente de faturamento.
export class MeterReadingService {
    constructor(
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    async list(userId: string, query: unknown): Promise<MeterReadingListResponse> {
        const parsed = listMeterReadingsQuerySchema.safeParse(query)
        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { targetType, targetId, granularity, from, to } = parsed.data

        const property = await resolveRootProperty(targetType, targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(targetType, targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }

        const items = await this.meterReadingRepository.findAggregated(
            meter.id,
            granularity,
            from,
            to,
        )

        return { items, granularity }
    }
}
