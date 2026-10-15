import {
    listConsumptionQuerySchema,
    consumptionSummaryQuerySchema,
    type Granularity,
} from "@/modules/consumption/consumption.schema.js"
import type {
    ConsumptionBucket,
    ConsumptionRepository,
} from "@/modules/consumption/consumption.repository.js"
import type { BillCalculators } from "@/modules/consumption/billing/createBillCalculators.js"
import type { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import type { GroupBWhiteBillCalculator } from "@/modules/consumption/billing/GroupBWhiteBillCalculator.js"
import type { PropertyMonthCostCalculator } from "@/modules/consumption/billing/PropertyMonthCostCalculator.js"
import type { YearlyPropertyCostCalculator } from "@/modules/consumption/billing/YearlyPropertyCostCalculator.js"
import type {
    GroupABreakdown,
    GroupBWhiteBreakdown,
    MonthCostResult,
} from "@/modules/consumption/billing/billing.types.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PropertyRepository,
    PropertyWithoutAddress,
} from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import type { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { resolveOwnedRootProperties, resolveRootProperty } from "@/shared/targetResolution.js"
import { requireDistributor, requireFlagPer100Kwh } from "@/shared/propertyBillingContext.js"
import { logger } from "@/shared/logger/logger.js"
import { mapWithConcurrency } from "@/shared/async/mapWithConcurrency.js"
import type { TargetType } from "@/generated/prisma/client.js"

export type { GroupABreakdown, GroupBWhiteBreakdown }

const log = logger.child({ module: "ConsumptionService" })

// AclContract.energyPricePerMwh é negociado em R$/MWh (mesma unidade do
// handoff de design); TariffService opera em R$/kWh.
// Itens do resumo calculados ao mesmo tempo. O custo do Grupo A dispara umas
// seis consultas por item, em paralelo, e o pool tem 10 conexões por padrão
// (`DB_POOL_MAX`) com espera de 5 s para obter uma: o Grupo A vai um item por
// vez, para o pico de uma requisição ficar em seis conexões. Os demais grupos
// (Convencional sem consulta, Branca com duas) aguentam três.
const SUMMARY_COST_CONCURRENCY_GROUP_A = 1
const SUMMARY_COST_CONCURRENCY_OTHER = 3

// `costBrl` é opcional: o consumo de um bucket sempre volta, o custo só quando
// o cálculo existe para aquele alvo, tarifa e granularidade (ver
// `calculateBucketCost`) — ausência é "não calculável", nunca zero.
export type ConsumptionBucketResponse = {
    bucketStart: Date
    kwhConsumed: number
    costBrl?: number
    avgPowerW: number
    groupA?: GroupABreakdown
    groupBWhite?: GroupBWhiteBreakdown
}

export type ConsumptionListResponse = Paginated<ConsumptionBucketResponse> & {
    granularity: Granularity
}

// Item do resumo em lote — mesma regra do bucket da lista: o consumo sempre
// volta, o custo só quando o cálculo existe para aquele alvo e tarifa.
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
    private readonly groupABillCalculator: GroupABillCalculator
    private readonly groupBWhiteBillCalculator: GroupBWhiteBillCalculator
    private readonly monthCostCalculator: PropertyMonthCostCalculator
    private readonly yearlyCostCalculator: YearlyPropertyCostCalculator

    /**
     * @param consumptionRepository - Acesso às leituras de medidor agregadas em baldes.
     * @param meterRepository - Resolve o medidor vinculado a um alvo.
     * @param propertyRepository - Resolve a propriedade raiz de um alvo e seus dados tarifários.
     * @param areaRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param deviceRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param distributorRepository - Resolve a distribuidora vinculada à propriedade, com suas tarifas.
     * @param tariffFlagRepository - Resolve a configuração vigente da bandeira tarifária.
     * @param billCalculators - Calculadoras de conta (Grupo A, Tarifa Branca, mês e ano).
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
        billCalculators: BillCalculators,
        private readonly tariffService: TariffService = new TariffService(),
    ) {
        this.groupABillCalculator = billCalculators.groupA
        this.groupBWhiteBillCalculator = billCalculators.groupBWhite
        this.monthCostCalculator = billCalculators.monthCost
        this.yearlyCostCalculator = billCalculators.yearlyCost
    }

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

        const distributor = await requireDistributor(
            this.distributorRepository,
            property.distributorId,
        )
        const flagPer100Kwh = await requireFlagPer100Kwh(this.tariffFlagRepository)

        const { skip, take } = toSkipTake(pagination)

        const bucketQuery = { meterId: meter.id, granularity, from, to }

        const { items: buckets, total } = await this.consumptionRepository.findAggregated({
            ...bucketQuery,
            order,
            skip,
            take,
        })

        const yearlyPropertyCostByBucketMs = await this.yearlyCostCalculator.computeForBuckets(
            meter.id,
            buckets,
            granularity,
            targetType,
            property,
            distributor,
            flagPer100Kwh,
        )

        const monthlyPropertyCostByBucketMs = await this.computeMonthlyPropertyCosts(
            meter.id,
            buckets,
            granularity,
            targetType,
            property,
            distributor,
            flagPer100Kwh,
        )

        const items: ConsumptionBucketResponse[] = await Promise.all(
            buckets.map(async (bucket) => {
                const cost = await this.resolveBucketCost(
                    meter.id,
                    bucket,
                    granularity,
                    targetType,
                    property,
                    distributor,
                    flagPer100Kwh,
                    yearlyPropertyCostByBucketMs,
                    monthlyPropertyCostByBucketMs,
                )
                return {
                    bucketStart: bucket.bucketStart,
                    kwhConsumed: bucket.kwhConsumed,
                    ...(cost && { costBrl: cost.totalBrl }),
                    avgPowerW: bucket.avgPowerW,
                    ...(cost?.groupA && { groupA: cost.groupA }),
                    ...(cost?.groupBWhite && { groupBWhite: cost.groupBWhite }),
                }
            }),
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

        // Posse verificada por id da lista, não só do primeiro, e filtrada no
        // banco: id inexistente ou de outro usuário é excluído silenciosamente
        // do resultado, não derruba o lote inteiro, e ninguém descobre se o id
        // existe (mesmo tratamento pra "não é seu" e "não existe"). Erro de
        // banco não entra nessa regra: propaga, em vez de virar "sem medidor".
        const propertyByTargetId = await resolveOwnedRootProperties(targetType, ids, userId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        const owned = ids.flatMap((id) => {
            const property = propertyByTargetId.get(id)
            return property ? [{ id, property }] : []
        })
        if (owned.length === 0) {
            return { items: [] }
        }

        const meterIdByTargetId = await this.meterRepository.findMeterIdsByTargets(
            targetType,
            owned.map(({ id }) => id),
        )

        const meterIds = [...new Set(meterIdByTargetId.values())]
        const latestBuckets = await this.consumptionRepository.findLatestAggregatedForMeters(
            meterIds,
            granularity,
            from,
            to,
        )
        const bucketByMeterId = new Map(latestBuckets.map((b) => [b.meterId, b]))

        const flagPer100Kwh = await requireFlagPer100Kwh(this.tariffFlagRepository)

        const withBucket = owned.flatMap(({ id, property }) => {
            const meterId = meterIdByTargetId.get(id)
            const bucket = meterId ? bucketByMeterId.get(meterId) : undefined
            return meterId && bucket ? [{ id, property, meterId, bucket }] : []
        })

        // Uma busca por distribuidora, não por item: os alvos de um lote
        // costumam dividir poucas distribuidoras.
        const distributorById = new Map(
            await Promise.all(
                [...new Set(withBucket.map(({ property }) => property.distributorId))].map(
                    async (distributorId) =>
                        [
                            distributorId,
                            await this.distributorRepository.findById(distributorId),
                        ] as const,
                ),
            ),
        )

        // Itens do lote em paralelo, mas em número limitado: o custo do Grupo A
        // abre várias consultas por item, e todos de uma vez esgotariam o pool.
        const costConcurrency = withBucket.some(
            ({ property }) => property.tariffGroup === "GROUP_A",
        )
            ? SUMMARY_COST_CONCURRENCY_GROUP_A
            : SUMMARY_COST_CONCURRENCY_OTHER
        const items: ConsumptionSummaryItem[] = await mapWithConcurrency(
            withBucket,
            costConcurrency,
            async ({ id, property, meterId, bucket }) => {
                const distributor = distributorById.get(property.distributorId)
                const costBrl = distributor
                    ? await this.resolveSummaryItemCost(
                          id,
                          meterId,
                          bucket,
                          granularity,
                          targetType,
                          property,
                          distributor,
                          flagPer100Kwh,
                      )
                    : null

                return {
                    id,
                    targetType,
                    bucketStart: bucket.bucketStart,
                    kwhConsumed: bucket.kwhConsumed,
                    avgPowerW: bucket.avgPowerW,
                    ...(costBrl !== null && { costBrl }),
                }
            },
        )

        return { items }
    }

    // Custo de 1 item de `summary()` — `null` quando o cálculo não existe ou
    // falha: o item continua no resultado com o consumo, só sem `costBrl`, e
    // os demais alvos do lote seguem respondendo. Grupo A e Tarifa Branca só
    // calculam custo em mês/ano + Propriedade — numa Área/Aparelho dessas
    // propriedades `calculateBucketCost` devolve `null`, o caso esperado e
    // silencioso; um `ValidationError` (modalidade ainda não suportada) também
    // omite o custo sem log; qualquer outro erro é logado antes de omitir, para
    // não mascarar uma falha real (catálogo ausente, timeout).
    private async resolveSummaryItemCost(
        targetId: string,
        meterId: string,
        bucket: { bucketStart: Date; kwhConsumed: number },
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number | null> {
        try {
            if (granularity === "year" && targetType === "PROPERTY") {
                return await this.yearlyCostCalculator.computeForYear(
                    meterId,
                    bucket.bucketStart,
                    property,
                    distributor,
                    flagPer100Kwh,
                )
            }
            const cost = await this.calculateBucketCost(
                meterId,
                bucket,
                granularity,
                targetType,
                property,
                distributor,
                flagPer100Kwh,
            )
            return cost?.totalBrl ?? null
        } catch (err) {
            if (!(err instanceof ValidationError)) {
                log.warn(
                    { err, targetId },
                    "Falha inesperada ao calcular custo — item devolvido sem custo",
                )
            }
            return null
        }
    }

    // Granularidade "month" + alvo PROPERTY nos grupos que consultam o consumo
    // por posto (Grupo A e Tarifa Branca): 1 cálculo em lote para todos os
    // meses da página, em vez de 1 por balde — cada mês custa várias queries
    // (consumo por posto, demanda, reativa) e eram disparados todos em
    // paralelo. Mesmo lote do caminho anual; o Grupo B Convencional é conta
    // pura, sem query, e segue por `calculateBucketCost`.
    private async computeMonthlyPropertyCosts(
        meterId: string,
        buckets: ConsumptionBucket[],
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<Map<number, MonthCostResult>> {
        if (granularity !== "month" || targetType !== "PROPERTY" || buckets.length === 0) {
            return new Map()
        }

        const monthStarts = buckets.map((b) => b.bucketStart)

        if (property.tariffGroup === "GROUP_A") {
            return this.groupABillCalculator.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
                property.contractingEnvironment,
            )
        }

        if (property.groupBModality === "WHITE") {
            return this.groupBWhiteBillCalculator.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        return new Map()
    }

    // Custo de um bucket dentro do map() de `list()` — extraído: year+PROPERTY
    // usa o pré-cálculo em lote de `computeYearlyPropertyCosts`
    // (o piso mensal já foi somado ali), month+PROPERTY do Grupo A/Branca usa
    // o de `computeMonthlyPropertyCosts`, os demais casos delegam a
    // `calculateBucketCost`, compartilhado com `summary()`.
    private async resolveBucketCost(
        meterId: string,
        bucket: ConsumptionBucket,
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
        yearlyPropertyCostByBucketMs: Map<number, number>,
        monthlyPropertyCostByBucketMs: Map<number, MonthCostResult>,
    ): Promise<MonthCostResult | null> {
        if (granularity === "year" && targetType === "PROPERTY") {
            return { totalBrl: yearlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime()) ?? 0 }
        }

        const monthlyCost = monthlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime())
        if (granularity === "month" && targetType === "PROPERTY" && monthlyCost) {
            return monthlyCost
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
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult | null> {
        if (granularity === "month" && targetType === "PROPERTY") {
            return this.monthCostCalculator.calculate(
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
        // Área/Aparelho de uma propriedade Grupo A não têm custo calculável.
        // Falhar fechado aqui não é lançar: o consumo continua válido e é
        // devolvido sem custo, em vez de reaplicar a tarifa plana do Grupo B
        // (que seria a conta errada, silenciosamente).
        if (property.tariffGroup === "GROUP_A") return null

        // Mesma disciplina da Azul acima: o consumo por posto da Branca só
        // existe agregado pelo mês inteiro da Propriedade (caminho acima) —
        // minuto/hora/dia e Área/Aparelho aplicariam a tarifa plana da
        // Convencional a uma propriedade que não está nela, uma conta
        // silenciosamente errada.
        if (property.groupBModality === "WHITE") return null

        // minute/hour/day (qualquer alvo) e month/year (AREA/DEVICE): sem
        // piso nem CIP — apenas energia + bandeira + tributos sobre o
        // consumo real do bucket.
        return {
            totalBrl: this.calculateSubTargetCost(bucket.kwhConsumed, distributor, flagPer100Kwh),
        }
    }
}
