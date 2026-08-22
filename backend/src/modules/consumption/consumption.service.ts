import { z } from "zod"
import {
    listConsumptionQuerySchema,
    type Granularity,
} from "@/modules/consumption/consumption.schema.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import {
    resolveFlagPer100Kwh,
    type TariffFlagRepository,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"

export type ConsumptionBucketResponse = {
    bucketStart: Date
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
}

export type ConsumptionListResponse = Paginated<ConsumptionBucketResponse> & {
    granularity: Granularity
}

// Consumo agregado — somente leitura, via MeterReading (Fase 3.3). Resolve o
// medidor vinculado ao alvo diretamente (sem rollup de subárvore): agregar
// também os medidores dos descendentes contaria a mesma energia duas vezes
// quando tanto a propriedade quanto um device dela têm medidor próprio.
export class ConsumptionService {
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly tariffFlagRepository: TariffFlagRepository,
        private readonly tariffService: TariffService = new TariffService(),
    ) {}

    async list(userId: string, query: unknown): Promise<ConsumptionListResponse> {
        const parsed = listConsumptionQuerySchema.safeParse(query)
        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { targetType, targetId, granularity, from, to, order, ...pagination } = parsed.data

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

        const distributor = await this.distributorRepository.findById(property.distributorId)
        if (!distributor) {
            throw new NotFoundError("Distribuidora vinculada não encontrada")
        }

        const tariffFlagConfig = await this.tariffFlagRepository.get()
        if (!tariffFlagConfig) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }
        const flagPer100Kwh = resolveFlagPer100Kwh(tariffFlagConfig)

        const { skip, take } = toSkipTake(pagination)

        const bucketQuery = { meterId: meter.id, granularity, from, to }

        const [buckets, total] = await Promise.all([
            this.consumptionRepository.findAggregated({ ...bucketQuery, order, skip, take }),
            this.consumptionRepository.countBuckets(bucketQuery),
        ])

        // Granularidade "year" + alvo PROPERTY: o piso de disponibilidade é
        // mensal, então o custo anual correto é a soma de 12 custos mensais
        // (cada um com seu próprio piso/CIP) — nunca o piso aplicado uma
        // única vez sobre o total do ano.
        const yearlyPropertyCostByBucketMs = new Map<number, number>()
        if (granularity === "year" && targetType === "PROPERTY" && buckets.length > 0) {
            const monthlyRows = await this.consumptionRepository.findMonthlyKwhForYears(
                meter.id,
                buckets.map((b) => b.bucketStart),
            )

            for (const row of monthlyRows) {
                const monthCost = this.tariffService.calculateForProperty({
                    kwhConsumed: row.kwhConsumed,
                    electricalSystem: property.electricalSystem,
                    publicLightingFeeBrl: property.publicLightingFeeBrl,
                    tusdPerKwh: distributor.tusdPerKwh,
                    tePerKwh: distributor.tePerKwh,
                    icmsRate: distributor.icmsRate,
                    pisRate: distributor.pisRate,
                    cofinsRate: distributor.cofinsRate,
                    flagPer100Kwh,
                }).totalBrl

                const key = row.yearBucket.getTime()
                yearlyPropertyCostByBucketMs.set(
                    key,
                    (yearlyPropertyCostByBucketMs.get(key) ?? 0) + monthCost,
                )
            }
        }

        const items: ConsumptionBucketResponse[] = buckets.map((bucket) => {
            let costBrl: number

            if (granularity === "year" && targetType === "PROPERTY") {
                costBrl = yearlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime()) ?? 0
            } else if (granularity === "month" && targetType === "PROPERTY") {
                costBrl = this.tariffService.calculateForProperty({
                    kwhConsumed: bucket.kwhConsumed,
                    electricalSystem: property.electricalSystem,
                    publicLightingFeeBrl: property.publicLightingFeeBrl,
                    tusdPerKwh: distributor.tusdPerKwh,
                    tePerKwh: distributor.tePerKwh,
                    icmsRate: distributor.icmsRate,
                    pisRate: distributor.pisRate,
                    cofinsRate: distributor.cofinsRate,
                    flagPer100Kwh,
                }).totalBrl
            } else {
                // minute/hour/day (qualquer alvo) e month/year (AREA/DEVICE):
                // sem piso nem CIP — apenas energia + bandeira + tributos
                // sobre o consumo real do bucket.
                costBrl = this.tariffService.calculateForSubTarget({
                    kwhConsumed: bucket.kwhConsumed,
                    tusdPerKwh: distributor.tusdPerKwh,
                    tePerKwh: distributor.tePerKwh,
                    icmsRate: distributor.icmsRate,
                    pisRate: distributor.pisRate,
                    cofinsRate: distributor.cofinsRate,
                    flagPer100Kwh,
                }).totalBrl
            }

            return {
                bucketStart: bucket.bucketStart,
                kwhConsumed: bucket.kwhConsumed,
                costBrl,
                avgPowerW: bucket.avgPowerW,
            }
        })

        return { items, total, page: pagination.page, pageSize: pagination.pageSize, granularity }
    }
}
