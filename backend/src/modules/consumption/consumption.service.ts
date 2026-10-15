import {
    listConsumptionQuerySchema,
    consumptionSummaryQuerySchema,
    compareAclToAcrQuerySchema,
    compareBrancaToConvencionalQuerySchema,
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
import {
    groupRowsByMs,
    resolveAclContractForMonth,
    resolveMonthWindow,
} from "@/modules/consumption/billing/monthWindow.js"
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
import {
    resolveFlagPer100Kwh,
    type TariffFlagRepository,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import type {
    TariffCatalogRepository,
    TariffEnergyRateResponse,
} from "@/modules/distributor/tariff-catalog.repository.js"
import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type {
    PldQuoteRepository,
    PldQuoteResponse,
} from "@/modules/pld-quote/pld-quote.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { resolveOwnedRootProperties, resolveRootProperty } from "@/shared/targetResolution.js"
import { logger } from "@/shared/logger/logger.js"
import { mapWithConcurrency } from "@/shared/async/mapWithConcurrency.js"
import type { AclSubmarket, TargetType, TariffPost } from "@/generated/prisma/client.js"

export type { GroupABreakdown, GroupBWhiteBreakdown }

const log = logger.child({ module: "ConsumptionService" })

// AclContract.energyPricePerMwh é negociado em R$/MWh (mesma unidade do
// handoff de design); TariffService opera em R$/kWh.
// Abaixo de meio centavo, os dois cenários exibem o mesmo valor em R$ (2
// casas decimais) — sem esta tolerância, um resíduo de ponto flutuante
// vindo da soma de vários meses (ex.: 0.00000000003) decidiria um veredito
// categórico ("X saiu mais barato") sobre uma diferença que o usuário nem
// consegue ver na tela. Usada pelos dois comparativos de propriedade
// (ACR × ACL e Convencional × Branca).
const VERDICT_EQUIVALENCE_TOLERANCE_BRL = 0.005

// Itens do resumo calculados ao mesmo tempo. O custo do Grupo A dispara umas
// seis consultas por item, em paralelo, e o pool tem 10 conexões por padrão
// (`DB_POOL_MAX`) com espera de 5 s para obter uma: o Grupo A vai um item por
// vez, para o pico de uma requisição ficar em seis conexões. Os demais grupos
// (Convencional sem consulta, Branca com duas) aguentam três.
const SUMMARY_COST_CONCURRENCY_GROUP_A = 1
const SUMMARY_COST_CONCURRENCY_OTHER = 3

/**
 * Sinal da diferença entre os dois cenários de uma comparação de
 * propriedade, já com a tolerância de equivalência aplicada. Extraída dos
 * dois resolvedores de veredito (ACR × ACL e Convencional × Branca) para a
 * tolerância existir num único lugar — os dois resolvedores só traduzem o
 * sinal para o rótulo do próprio domínio.
 *
 * @param totalDiffBrl - Custo do primeiro cenário menos o do segundo, em reais.
 * @returns `1` se o primeiro cenário sai mais caro (o segundo é o mais barato), `-1` se o primeiro é o mais barato, `0` se a diferença é irrelevante (abaixo de meio centavo).
 */
export function resolveComparisonSign(totalDiffBrl: number): 1 | 0 | -1 {
    if (totalDiffBrl > VERDICT_EQUIVALENCE_TOLERANCE_BRL) return 1
    if (totalDiffBrl < -VERDICT_EQUIVALENCE_TOLERANCE_BRL) return -1
    return 0
}

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

// Comparação ACR × ACL — o veredito nomeia quem sai mais barato no
// consumo real do período pedido, não uma recomendação de ação (a
// propriedade já precisa estar em ACL com contrato para chegar aqui — ver
// `compareAclToAcr`); "EQUIVALENT" cobre o empate exato, que os dois
// cálculos em reais tornam possível mesmo sendo raro na prática.
export type AclComparisonVerdict = "ACL_CHEAPER" | "ACR_CHEAPER" | "EQUIVALENT"

export type AclComparisonMonthResult = {
    monthStart: Date
    acrBrl: number
    aclBrl: number
    diffBrl: number
}

export type AclComparisonResponse = {
    propertyId: string
    from: Date
    to: Date
    months: AclComparisonMonthResult[]
    totalAcrBrl: number
    totalAclBrl: number
    totalDiffBrl: number
    diffPercent: number
    verdict: AclComparisonVerdict
    pldContext: PldQuoteResponse[]
}

// Comparação Convencional × Branca — mesmo papel de AclComparisonVerdict: o
// veredito nomeia quem sai mais barato no consumo real do período pedido
// (a propriedade já precisa estar em WHITE para chegar aqui — ver
// `compareBrancaToConvencional`), não uma recomendação de adesão.
export type BrancaComparisonVerdict = "BRANCA_CHEAPER" | "CONVENCIONAL_CHEAPER" | "EQUIVALENT"

export type BrancaComparisonMonthResult = {
    monthStart: Date
    convencionalBrl: number
    brancaBrl: number
    diffBrl: number
}

export type BrancaComparisonResponse = {
    propertyId: string
    from: Date
    to: Date
    months: BrancaComparisonMonthResult[]
    totalConvencionalBrl: number
    totalBrancaBrl: number
    totalDiffBrl: number
    diffPercent: number
    verdict: BrancaComparisonVerdict
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
     * @param tariffCatalogRepository - Resolve o catálogo de tarifas da Branca para a comparação Convencional × Branca.
     * @param aclContractRepository - Resolve o contrato de energia vigente de uma propriedade em ACL (TE negociada, no lugar da TE do catálogo).
     * @param pldQuoteRepository - Resolve o PLD do(s) submercado(s) dos contratos ACL envolvidos — contexto informativo da comparação ACR × ACL, não insumo do cálculo.
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
        private readonly tariffCatalogRepository: TariffCatalogRepository,
        private readonly aclContractRepository: AclContractRepository,
        private readonly pldQuoteRepository: PldQuoteRepository,
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

        const tariffFlagConfig = await this.tariffFlagRepository.get()
        if (!tariffFlagConfig) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }
        const flagPer100Kwh = resolveFlagPer100Kwh(tariffFlagConfig)

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

    // `from`/`to` chegam como datas de calendário (mesma convenção de
    // AclContract.validFrom/validTo, não convertidas por `fromSaoPauloLocal`)
    // — trunca cada ponta para o primeiro dia do mês e enumera os meses
    // "rotulados como UTC" entre eles, o mesmo formato que `monthStarts` já
    // usa em todo o resto do arquivo. Inclusive nas duas pontas: comparar
    // jun–ago devolve [jun, jul, ago].
    private monthStartsInRange(from: Date, to: Date): Date[] {
        const starts: Date[] = []
        let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
        const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
        while (cursor <= end) {
            starts.push(cursor)
            cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
        }
        return starts
    }

    private resolveAclComparisonVerdict(totalDiffBrl: number): AclComparisonVerdict {
        const sign = resolveComparisonSign(totalDiffBrl)
        if (sign > 0) return "ACL_CHEAPER"
        if (sign < 0) return "ACR_CHEAPER"
        return "EQUIVALENT"
    }

    private resolveBrancaComparisonVerdict(totalDiffBrl: number): BrancaComparisonVerdict {
        const sign = resolveComparisonSign(totalDiffBrl)
        if (sign > 0) return "BRANCA_CHEAPER"
        if (sign < 0) return "CONVENCIONAL_CHEAPER"
        return "EQUIVALENT"
    }

    // Um mês da comparação Convencional × Branca: mesmo consumo real por
    // posto nos dois cenários — o cenário Branca usa a decomposição por
    // posto de `TariffService.calculateForGroupBWhite` (com o mesmo piso de
    // disponibilidade pela Convencional que a conta real já aplica), o
    // cenário "e se fosse Convencional" usa `calculateForProperty` com o
    // mesmo total de kWh. Abaixo do piso, os dois cenários convergem para a
    // mesma conta (a Branca já delega à Convencional nesse caso) — `diffBrl`
    // fica exatamente zero, não uma aproximação.
    private calculateBrancaComparisonMonth(
        monthStart: Date,
        kwhByPost: { post: TariffPost; kwhConsumed: number }[],
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        rateByPost: Map<TariffPost, TariffEnergyRateResponse>,
        flagPer100Kwh: number,
    ): BrancaComparisonMonthResult {
        const energyByPost = kwhByPost.map((row) => {
            const rate = rateByPost.get(row.post)
            if (!rate) {
                throw new NotFoundError(
                    "Catálogo da Tarifa Branca não cadastrado para esta distribuidora/posto",
                )
            }
            return {
                post: row.post,
                kwhConsumed: row.kwhConsumed,
                tusdPerKwh: rate.tusdPerKwh,
                tePerKwh: rate.tePerKwh,
            }
        })
        const totalKwh = kwhByPost.reduce((sum, row) => sum + row.kwhConsumed, 0)

        const brancaResult = this.tariffService.calculateForGroupBWhite({
            energyByPost,
            electricalSystem: property.electricalSystem,
            conventionalTusdPerKwh: distributor.tusdPerKwh,
            conventionalTePerKwh: distributor.tePerKwh,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
            publicLightingFeeBrl: property.publicLightingFeeBrl,
        })

        const convencionalResult = this.tariffService.calculateForProperty({
            kwhConsumed: totalKwh,
            electricalSystem: property.electricalSystem,
            publicLightingFeeBrl: property.publicLightingFeeBrl,
            tusdPerKwh: distributor.tusdPerKwh,
            tePerKwh: distributor.tePerKwh,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
        })

        return {
            monthStart,
            convencionalBrl: convencionalResult.totalBrl,
            brancaBrl: brancaResult.totalBrl,
            diffBrl: convencionalResult.totalBrl - brancaResult.totalBrl,
        }
    }

    // Extraído de `compareAclToAcr` só para caber no teto de linhas — a
    // lógica em si não mudou: busca os contratos sobrepostos à janela
    // inteira e filtra para os meses que de fato têm algum contrato vigente.
    // Falha fechado só quando NENHUM mês do período pedido é comparável —
    // um subconjunto vazio não tem o que responder.
    private async resolveComparableMonths(
        propertyId: string,
        monthStarts: Date[],
        minMonthStart: Date,
        maxMonthEnd: Date,
    ): Promise<{ comparableMonthStarts: Date[]; contractsInRange: AclContractResponse[] }> {
        const contractsInRange = await this.aclContractRepository.findOverlappingForProperty(
            propertyId,
            minMonthStart,
            maxMonthEnd,
        )
        const comparableMonthStarts = monthStarts.filter(
            (monthStart) => resolveAclContractForMonth(contractsInRange, monthStart) !== undefined,
        )
        if (comparableMonthStarts.length === 0) {
            throw new NotFoundError(
                "Nenhum contrato de energia do Mercado Livre (ACL) vigente para o período",
            )
        }
        return { comparableMonthStarts, contractsInRange }
    }

    /**
     * `GET /api/consumption/acl-comparison` — recalcula o consumo
     * real medido da propriedade nos dois cenários (TE do catálogo regulado
     * com bandeira vs. TE do `AclContract` vigente sem bandeira), mês a mês,
     * para a mesma janela. Meses sem contrato ACL vigente (histórico
     * anterior ao contrato, ou um buraco entre dois contratos) ficam de fora
     * de `months` — não há cenário ACL de verdade para comparar naquele mês,
     * incluir um valor degradado para o catálogo regulado como se fosse "o
     * ACL" mentiria a diferença como zero. Falha fechado só quando **nenhum**
     * mês do período pedido tem contrato — aí não há comparação nenhuma a
     * fazer.
     *
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param query - Query string bruta (propriedade e janela), validada aqui.
     * @returns O custo mês a mês nos dois cenários, a diferença, o veredito e o PLD do período como contexto informativo.
     */
    async compareAclToAcr(userId: string, query: unknown): Promise<AclComparisonResponse> {
        const { propertyId, from, to } = parseOrThrow(compareAclToAcrQuerySchema, query)

        const property = await this.propertyRepository.findById(propertyId)
        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        if (property.contractingEnvironment !== "ACL") {
            throw new ValidationError(
                "Comparação ACR × ACL só está disponível para propriedades no ambiente de contratação livre (ACL)",
            )
        }

        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) {
            throw new NotFoundError("Esta propriedade não possui medidor vinculado")
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

        const monthStarts = this.monthStartsInRange(from, to)
        const lastMonthStart = monthStarts[monthStarts.length - 1]!
        const minMonthStart = monthStarts[0]!
        const maxMonthEnd = new Date(
            Date.UTC(lastMonthStart.getUTCFullYear(), lastMonthStart.getUTCMonth() + 1, 1),
        )

        const { comparableMonthStarts, contractsInRange } = await this.resolveComparableMonths(
            property.id,
            monthStarts,
            minMonthStart,
            maxMonthEnd,
        )

        const [acrByMonth, aclByMonth] = await Promise.all([
            this.groupABillCalculator.calculateMonthlyCosts(
                meter.id,
                comparableMonthStarts,
                property,
                distributor,
                flagPer100Kwh,
                "ACR",
            ),
            this.groupABillCalculator.calculateMonthlyCosts(
                meter.id,
                comparableMonthStarts,
                property,
                distributor,
                flagPer100Kwh,
                "ACL",
            ),
        ])

        const months: AclComparisonMonthResult[] = comparableMonthStarts.map((monthStart) => {
            const acrBrl = acrByMonth.get(monthStart.getTime())!.totalBrl
            const aclBrl = aclByMonth.get(monthStart.getTime())!.totalBrl
            return { monthStart, acrBrl, aclBrl, diffBrl: acrBrl - aclBrl }
        })

        const totalAcrBrl = months.reduce((sum, m) => sum + m.acrBrl, 0)
        const totalAclBrl = months.reduce((sum, m) => sum + m.aclBrl, 0)
        const totalDiffBrl = totalAcrBrl - totalAclBrl
        const diffPercent = totalAcrBrl === 0 ? 0 : (totalDiffBrl / totalAcrBrl) * 100

        const submarkets = [...new Set<AclSubmarket>(contractsInRange.map((c) => c.submarket))]
        const pldContext = await this.pldQuoteRepository.findBySubmarketsInRange(
            submarkets,
            minMonthStart,
            maxMonthEnd,
        )

        return {
            propertyId,
            from,
            to,
            months,
            totalAcrBrl,
            totalAclBrl,
            totalDiffBrl,
            diffPercent,
            verdict: this.resolveAclComparisonVerdict(totalDiffBrl),
            pldContext,
        }
    }

    /**
     * `GET /api/consumption/branca-comparison` — recalcula o mesmo consumo
     * real medido da propriedade nos dois cenários (tarifa Convencional
     * plana vs. decomposição por posto da Tarifa Branca), mês a mês, para a
     * mesma janela. Só disponível para propriedade já na Tarifa Branca
     * (`groupBModality` WHITE) — comparar exigiria primeiro migrar o
     * cadastro para poder ter o catálogo por posto resolvido.
     *
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param query - Query string bruta (propriedade e janela), validada aqui.
     * @returns O custo mês a mês nos dois cenários, a diferença, o percentual e o veredito.
     */
    async compareBrancaToConvencional(
        userId: string,
        query: unknown,
    ): Promise<BrancaComparisonResponse> {
        const { propertyId, from, to } = parseOrThrow(compareBrancaToConvencionalQuerySchema, query)

        const property = await this.propertyRepository.findById(propertyId)
        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        if (property.groupBModality !== "WHITE") {
            throw new ValidationError(
                "Comparação Convencional × Branca só está disponível para propriedades na Tarifa Branca (Grupo B)",
            )
        }

        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) {
            throw new NotFoundError("Esta propriedade não possui medidor vinculado")
        }

        const distributor = await this.distributorRepository.findById(property.distributorId)
        if (!distributor) {
            throw new NotFoundError("Distribuidora vinculada não encontrada")
        }
        if (distributor.peakWindowStartHour === null || distributor.peakWindowEndHour === null) {
            throw new ValidationError(
                "Distribuidora sem janela de ponta configurada — não é possível calcular a conta da Tarifa Branca",
            )
        }
        const peakWindow: PeakWindowConfig = {
            peakWindowStartHour: distributor.peakWindowStartHour,
            peakWindowEndHour: distributor.peakWindowEndHour,
        }

        const tariffFlagConfig = await this.tariffFlagRepository.get()
        if (!tariffFlagConfig) {
            throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
        }
        const flagPer100Kwh = resolveFlagPer100Kwh(tariffFlagConfig)

        const energyRates = await this.tariffCatalogRepository.findGroupBEnergyRates(
            distributor.id,
            "WHITE",
        )
        if (energyRates.length === 0) {
            throw new NotFoundError(
                "Catálogo da Tarifa Branca não cadastrado para esta distribuidora",
            )
        }
        const rateByPost = new Map(energyRates.map((rate) => [rate.post, rate]))

        // 1 consulta para todos os meses da janela; mês sem leitura não tem
        // linha e entra como consumo zero em todos os postos.
        const monthStarts = this.monthStartsInRange(from, to)
        const window = resolveMonthWindow(monthStarts)
        const kwhByPostRows = await this.consumptionRepository.findKwhByPostGroupedByMonth(
            meter.id,
            window.from,
            window.to,
            peakWindow,
            window.holidays,
            true,
        )
        const kwhByPostByMonthMs = groupRowsByMs(kwhByPostRows, (row) => row.monthBucket.getTime())
        const months = monthStarts.map((monthStart) =>
            this.calculateBrancaComparisonMonth(
                monthStart,
                kwhByPostByMonthMs.get(monthStart.getTime()) ?? [],
                property,
                distributor,
                rateByPost,
                flagPer100Kwh,
            ),
        )

        const totalConvencionalBrl = months.reduce((sum, m) => sum + m.convencionalBrl, 0)
        const totalBrancaBrl = months.reduce((sum, m) => sum + m.brancaBrl, 0)
        const totalDiffBrl = totalConvencionalBrl - totalBrancaBrl
        const diffPercent =
            totalConvencionalBrl === 0 ? 0 : (totalDiffBrl / totalConvencionalBrl) * 100

        return {
            propertyId,
            from,
            to,
            months,
            totalConvencionalBrl,
            totalBrancaBrl,
            totalDiffBrl,
            diffPercent,
            verdict: this.resolveBrancaComparisonVerdict(totalDiffBrl),
        }
    }
}
