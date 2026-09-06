import {
    listConsumptionQuerySchema,
    consumptionSummaryQuerySchema,
    type Granularity,
} from "@/modules/consumption/consumption.schema.js"
import type {
    ConsumptionBucket,
    ConsumptionRepository,
} from "@/modules/consumption/consumption.repository.js"
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
import { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidays } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
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

/**
 * Consumo agregado — somente leitura, via MeterReading. Resolve o
 * medidor vinculado ao alvo diretamente (sem rollup de subárvore): agregar
 * também os medidores dos descendentes contaria a mesma energia duas vezes
 * quando tanto a propriedade quanto um device dela têm medidor próprio.
 */
export class ConsumptionService {
    /**
     * @param consumptionRepository - Acesso às leituras de medidor agregadas em baldes.
     * @param meterRepository - Resolve o medidor vinculado a um alvo.
     * @param propertyRepository - Resolve a propriedade raiz de um alvo e seus dados tarifários.
     * @param areaRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param deviceRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param distributorRepository - Resolve a distribuidora vinculada à propriedade, com suas tarifas.
     * @param tariffFlagRepository - Resolve a configuração vigente da bandeira tarifária.
     * @param tariffCatalogRepository - Resolve o catálogo de tarifas de energia/demanda do Grupo A (RF26).
     * @param tariffService - Calcula o custo em reais a partir do consumo em kWh.
     */
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly tariffFlagRepository: TariffFlagRepository,
        private readonly tariffCatalogRepository: TariffCatalogRepository,
        private readonly tariffService: TariffService = new TariffService(),
    ) {}

    /**
     * Consumo agregado e paginado de um único alvo, já com o custo em reais
     * calculado por balde.
     *
     * @param userId - Id do usuário autenticado (dono do alvo).
     * @param query - Query string bruta (alvo, granularidade, janela, paginação), validada aqui.
     * @returns Página de baldes de consumo com custo, mais a granularidade usada.
     */
    async list(userId: string, query: unknown): Promise<ConsumptionListResponse> {
        const { targetType, targetId, granularity, from, to, order, ...pagination } = parseOrThrow(
            listConsumptionQuerySchema,
            query,
        )

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

        const { items: buckets, total } = await this.consumptionRepository.findAggregated({
            ...bucketQuery,
            order,
            skip,
            take,
        })

        const yearlyPropertyCostByBucketMs = await this.computeYearlyPropertyCosts(
            meter.id,
            buckets,
            granularity,
            targetType,
            property,
            distributor,
            flagPer100Kwh,
        )

        const items: ConsumptionBucketResponse[] = await Promise.all(
            buckets.map(async (bucket) => ({
                bucketStart: bucket.bucketStart,
                kwhConsumed: bucket.kwhConsumed,
                costBrl: await this.resolveBucketCost(
                    meter.id,
                    bucket,
                    granularity,
                    targetType,
                    property,
                    distributor,
                    flagPer100Kwh,
                    yearlyPropertyCostByBucketMs,
                ),
                avgPowerW: bucket.avgPowerW,
            })),
        )

        return { items, total, page: pagination.page, pageSize: pagination.pageSize, granularity }
    }

    /**
     * `GET /api/consumption/summary` — o último bucket de um conjunto de
     * alvos do MESMO targetType, resolvido numa única query de agregação
     * (Prisma) para todos os medidores, em vez de uma chamada de `list()`
     * por alvo. Não é paginado — é exatamente o que os 3 pontos de fan-out
     * do frontend pedem (o bucket mais recente por alvo), não uma listagem
     * genérica.
     *
     * @param userId - Id do usuário autenticado (dono dos alvos).
     * @param query - Query string bruta (tipo de alvo, ids, granularidade, janela), validada aqui.
     * @returns O bucket mais recente de cada alvo de posse do usuário.
     */
    async summary(userId: string, query: unknown): Promise<ConsumptionSummaryResponse> {
        const { targetType, ids, granularity, from, to } = parseOrThrow(
            consumptionSummaryQuerySchema,
            query,
        )

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
                    : await this.calculateBucketCost(
                          meter.id,
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

    // Granularidade "year" + alvo PROPERTY: o piso de disponibilidade é
    // mensal, então o custo anual correto é a soma de 12 custos mensais
    // (cada um com seu próprio piso/CIP) — nunca o piso aplicado uma
    // única vez sobre o total do ano. Batching por página inteira (1 query
    // pra todos os buckets de ano da página) — extraído do corpo de `list()`.
    // `summary()` tem seu equivalente em `calculateYearlyPropertyCost`, que
    // resolve o mesmo cálculo pra 1 bucket só.
    private async computeYearlyPropertyCosts(
        meterId: string,
        buckets: ConsumptionBucket[],
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<Map<number, number>> {
        const yearlyPropertyCostByBucketMs = new Map<number, number>()

        if (granularity !== "year" || targetType !== "PROPERTY" || buckets.length === 0) {
            return yearlyPropertyCostByBucketMs
        }

        const monthlyRows = await this.consumptionRepository.findMonthlyKwhForYears(
            meterId,
            buckets.map((b) => b.bucketStart),
        )

        for (const row of monthlyRows) {
            const monthCost = await this.calculateMonthCost(
                meterId,
                row.monthBucket,
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

        return yearlyPropertyCostByBucketMs
    }

    // Custo de um bucket dentro do map() de `list()` — extraído: year+PROPERTY
    // usa o pré-cálculo em lote de `computeYearlyPropertyCosts`
    // (o piso mensal já foi somado ali), os demais casos delegam a
    // `calculateBucketCost`, compartilhado com `summary()`.
    private async resolveBucketCost(
        meterId: string,
        bucket: ConsumptionBucket,
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
        yearlyPropertyCostByBucketMs: Map<number, number>,
    ): Promise<number> {
        if (granularity === "year" && targetType === "PROPERTY") {
            return yearlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime()) ?? 0
        }

        return this.calculateBucketCost(
            meterId,
            bucket,
            granularity,
            targetType,
            property,
            distributor,
            flagPer100Kwh,
        )
    }

    // Custo de um único mês (a unidade que sustenta o piso/CIP de PROPERTY)
    // — compartilhado entre o batching por página de `list()` e o cálculo
    // por alvo de `summary()`.
    // RN23 — o cálculo ramifica por grupo tarifário em vez de generalizar:
    // Grupo B usa o monômio de sempre (piso + tarifa plana da distribuidora);
    // Grupo A precisa do consumo por posto e da demanda contratada, então
    // delega a `calculateGroupAMonthCost` (que faz suas próprias consultas,
    // já que `kwhConsumed` aqui é um total do mês, não quebrado por posto).
    private async calculateMonthCost(
        meterId: string,
        monthStartLocal: Date,
        kwhConsumed: number,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number> {
        if (property.tariffGroup === "GROUP_A") {
            return this.calculateGroupAMonthCost(
                meterId,
                monthStartLocal,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

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

    // Conta binômia do Grupo A (RF29/RN17/RN18-Verde) — só a modalidade
    // Verde está implementada; Azul/Convencional falham fechado (Fase 20).
    // Falha fechada também sem janela de ponta configurada ou sem demanda
    // contratada, em vez de silenciosamente aplicar a fórmula errada.
    private async calculateGroupAMonthCost(
        meterId: string,
        monthStartLocal: Date,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number> {
        if (distributor.peakWindowStartHour === null || distributor.peakWindowEndHour === null) {
            throw new ValidationError(
                "Distribuidora sem janela de ponta configurada — não é possível calcular a conta do Grupo A",
            )
        }
        if (property.tariffModality !== "GREEN") {
            throw new ValidationError(
                "Cálculo de conta do Grupo A ainda não suportado para esta modalidade tarifária",
            )
        }
        if (property.contractedDemandKw === null) {
            throw new ValidationError("Propriedade do Grupo A sem demanda contratada cadastrada")
        }
        if (!property.tariffSubgroup) {
            throw new ValidationError("Propriedade do Grupo A sem subgrupo cadastrado")
        }

        const peakWindow: PeakWindowConfig = {
            peakWindowStartHour: distributor.peakWindowStartHour,
            peakWindowEndHour: distributor.peakWindowEndHour,
        }

        // `monthStartLocal` vem de date_trunc('month', localTsExpr()) — os
        // campos de calendário (ano/mês) já são os locais corretos, só
        // rotulados como UTC (mesmo truque de consumption.repository.ts).
        // `fromSaoPauloLocal` converte para o instante UTC real que
        // findKwhByPost espera (mesmo idioma do DemandRollupScheduler).
        const monthEndLocal = new Date(
            Date.UTC(monthStartLocal.getUTCFullYear(), monthStartLocal.getUTCMonth() + 1, 1),
        )
        const from = fromSaoPauloLocal(monthStartLocal)
        const to = fromSaoPauloLocal(monthEndLocal)
        const holidays = getNationalHolidays(monthStartLocal.getUTCFullYear())

        const [kwhByPost, energyRates, demandRate] = await Promise.all([
            this.consumptionRepository.findKwhByPost(meterId, from, to, peakWindow, holidays),
            this.tariffCatalogRepository.findEnergyRates(
                distributor.id,
                property.tariffSubgroup,
                property.tariffModality,
            ),
            this.tariffCatalogRepository.findSingleDemandRate(
                distributor.id,
                property.tariffSubgroup,
                property.tariffModality,
            ),
        ])

        if (energyRates.length === 0 || !demandRate) {
            throw new NotFoundError(
                "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
            )
        }

        const kwhByPostMap = new Map(kwhByPost.map((k) => [k.post, k.kwhConsumed]))
        const energyByPost = energyRates.map((rate) => ({
            post: rate.post,
            kwhConsumed: kwhByPostMap.get(rate.post) ?? 0,
            tusdPerKwh: rate.tusdPerKwh,
            tePerKwh: rate.tePerKwh,
        }))

        return this.tariffService.calculateForGroupA({
            contractedDemandKw: property.contractedDemandKw,
            tusdPerKw: demandRate.tusdPerKw,
            energyByPost,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
            publicLightingFeeBrl: property.publicLightingFeeBrl,
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
    private async calculateBucketCost(
        meterId: string,
        bucket: { bucketStart: Date; kwhConsumed: number },
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number> {
        if (granularity === "month" && targetType === "PROPERTY") {
            return this.calculateMonthCost(
                meterId,
                bucket.bucketStart,
                bucket.kwhConsumed,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        // Demanda contratada (conceito mensal) só faz sentido na conta
        // mensal da Propriedade inteira (caminho acima) — minuto/hora/dia e
        // Área/Aparelho de uma propriedade Grupo A falham fechado aqui em
        // vez de reaplicar a tarifa plana do Grupo B (que seria a conta
        // errada, silenciosamente).
        if (property.tariffGroup === "GROUP_A") {
            throw new ValidationError(
                "Detalhamento de sub-nível ou sub-período ainda não suportado para propriedades do Grupo A",
            )
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

        let sum = 0
        for (const row of monthlyRows) {
            sum += await this.calculateMonthCost(
                meterId,
                row.monthBucket,
                row.kwhConsumed,
                property,
                distributor,
                flagPer100Kwh,
            )
        }
        return sum
    }
}
