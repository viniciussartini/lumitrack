import { z } from "zod"
import {
    listConsumptionQuerySchema,
    consumptionSummaryQuerySchema,
    type Granularity,
} from "@/modules/consumption/consumption.schema.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import {
    resolveFlagPer100Kwh,
    type TariffFlagRepository,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import type { TargetType } from "@/generated/prisma/client.js"

export type ConsumptionBucketResponse = {
    bucketStart: Date
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
}

export type ConsumptionListResponse = Paginated<ConsumptionBucketResponse> & {
    granularity: Granularity
}

export type ConsumptionSummaryItem = ConsumptionBucketResponse & {
    id: string
    targetType: TargetType
}

export type ConsumptionSummaryResponse = {
    items: ConsumptionSummaryItem[]
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
        // única vez sobre o total do ano. Batching por página inteira (1
        // query pra todos os buckets de ano da página) — diferente do caso
        // de `summary()`, que só tem 1 bucket por alvo e resolve isso inline.
        const yearlyPropertyCostByBucketMs = new Map<number, number>()
        if (granularity === "year" && targetType === "PROPERTY" && buckets.length > 0) {
            const monthlyRows = await this.consumptionRepository.findMonthlyKwhForYears(
                meter.id,
                buckets.map((b) => b.bucketStart),
            )

            for (const row of monthlyRows) {
                const monthCost = this.calculateMonthCost(
                    row.kwhConsumed,
                    property,
                    distributor,
                    flagPer100Kwh,
                )

                const key = row.yearBucket.getTime()
                yearlyPropertyCostByBucketMs.set(
                    key,
                    (yearlyPropertyCostByBucketMs.get(key) ?? 0) + monthCost,
                )
            }
        }

        const items: ConsumptionBucketResponse[] = buckets.map((bucket) => {
            const costBrl =
                granularity === "year" && targetType === "PROPERTY"
                    ? (yearlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime()) ?? 0)
                    : this.calculateBucketCost(
                          bucket,
                          granularity,
                          targetType,
                          property,
                          distributor,
                          flagPer100Kwh,
                      )

            return {
                bucketStart: bucket.bucketStart,
                kwhConsumed: bucket.kwhConsumed,
                costBrl,
                avgPowerW: bucket.avgPowerW,
            }
        })

        return { items, total, page: pagination.page, pageSize: pagination.pageSize, granularity }
    }

    // GET /api/consumption/summary — o último bucket de um conjunto de
    // alvos do MESMO targetType, resolvido numa única query de agregação
    // (Prisma) para todos os medidores, em vez de uma chamada de `list()`
    // por alvo. Não é paginado — é exatamente o que os 3 pontos de fan-out
    // do frontend pedem (o bucket mais recente por alvo), não uma listagem
    // genérica.
    async summary(userId: string, query: unknown): Promise<ConsumptionSummaryResponse> {
        const parsed = consumptionSummaryQuerySchema.safeParse(query)
        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }
        const { targetType, ids, granularity, from, to } = parsed.data

        // Autorização verificada por id da lista, não só do primeiro — id
        // inexistente ou de outro usuário é excluído silenciosamente do
        // resultado, não derruba o lote inteiro. Nega por padrão sem vazar
        // se o id existe ou não (mesmo tratamento pra "não é seu" e "não
        // existe").
        const resolved = await Promise.all(
            ids.map(async (id) => {
                try {
                    const property = await resolveRootProperty(targetType, id, {
                        propertyRepository: this.propertyRepository,
                        areaRepository: this.areaRepository,
                        deviceRepository: this.deviceRepository,
                    })
                    if (property.userId !== userId) return null
                    return { id, property }
                } catch {
                    return null
                }
            }),
        )
        const owned = resolved.filter(
            (r): r is { id: string; property: PropertyResponse } => r !== null,
        )
        if (owned.length === 0) {
            return { items: [] }
        }

        const meterByTargetId = new Map<string, { id: string }>()
        await Promise.all(
            owned.map(async ({ id }) => {
                const meter = await this.meterRepository.findByTarget(targetType, id)
                if (meter) meterByTargetId.set(id, meter)
            }),
        )

        const meterIds = [...new Set([...meterByTargetId.values()].map((m) => m.id))]
        const latestBuckets = await this.consumptionRepository.findLatestAggregatedForMeters(
            meterIds,
            granularity,
            from,
            to,
        )
        const bucketByMeterId = new Map(latestBuckets.map((b) => [b.meterId, b]))

        const tariffFlagConfig = await this.tariffFlagRepository.get()
        if (!tariffFlagConfig) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }
        const flagPer100Kwh = resolveFlagPer100Kwh(tariffFlagConfig)

        const items: ConsumptionSummaryItem[] = []
        for (const { id, property } of owned) {
            const meter = meterByTargetId.get(id)
            if (!meter) continue
            const bucket = bucketByMeterId.get(meter.id)
            if (!bucket) continue

            const distributor = await this.distributorRepository.findById(property.distributorId)
            if (!distributor) continue

            const costBrl =
                granularity === "year" && targetType === "PROPERTY"
                    ? await this.calculateYearlyPropertyCost(
                          meter.id,
                          bucket.bucketStart,
                          property,
                          distributor,
                          flagPer100Kwh,
                      )
                    : this.calculateBucketCost(
                          bucket,
                          granularity,
                          targetType,
                          property,
                          distributor,
                          flagPer100Kwh,
                      )

            items.push({
                id,
                targetType,
                bucketStart: bucket.bucketStart,
                kwhConsumed: bucket.kwhConsumed,
                costBrl,
                avgPowerW: bucket.avgPowerW,
            })
        }

        return { items }
    }

    // Custo de um único mês (a unidade que sustenta o piso/CIP de PROPERTY)
    // — compartilhado entre o batching por página de `list()` e o cálculo
    // por alvo de `summary()`.
    private calculateMonthCost(
        kwhConsumed: number,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): number {
        return this.tariffService.calculateForProperty({
            kwhConsumed,
            electricalSystem: property.electricalSystem,
            publicLightingFeeBrl: property.publicLightingFeeBrl,
            tusdPerKwh: distributor.tusdPerKwh,
            tePerKwh: distributor.tePerKwh,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
        }).totalBrl
    }

    private calculateSubTargetCost(
        kwhConsumed: number,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): number {
        return this.tariffService.calculateForSubTarget({
            kwhConsumed,
            tusdPerKwh: distributor.tusdPerKwh,
            tePerKwh: distributor.tePerKwh,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
        }).totalBrl
    }

    // Custo de um bucket que NÃO é year+PROPERTY (esse caso exige a soma de
    // 12 meses com piso próprio cada — tratado à parte por cada chamador,
    // porque o formato de batching difere: `list()` soma para a página
    // inteira de uma vez, `summary()` só tem 1 bucket por alvo).
    private calculateBucketCost(
        bucket: { kwhConsumed: number },
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): number {
        if (granularity === "month" && targetType === "PROPERTY") {
            return this.calculateMonthCost(bucket.kwhConsumed, property, distributor, flagPer100Kwh)
        }
        // minute/hour/day (qualquer alvo) e month/year (AREA/DEVICE): sem
        // piso nem CIP — apenas energia + bandeira + tributos sobre o
        // consumo real do bucket.
        return this.calculateSubTargetCost(bucket.kwhConsumed, distributor, flagPer100Kwh)
    }

    // Usado só por `summary()` — o bucket "year" de um único alvo PROPERTY.
    // `list()` resolve o equivalente em lote (todos os buckets de ano da
    // página numa só chamada a `findMonthlyKwhForYears`); aqui é sempre 1
    // bucket, então 1 chamada com array de 1 elemento é o bastante.
    private async calculateYearlyPropertyCost(
        meterId: string,
        yearBucketStart: Date,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number> {
        const monthlyRows = await this.consumptionRepository.findMonthlyKwhForYears(meterId, [
            yearBucketStart,
        ])
        return monthlyRows.reduce(
            (sum, row) =>
                sum +
                this.calculateMonthCost(row.kwhConsumed, property, distributor, flagPer100Kwh),
            0,
        )
    }
}
