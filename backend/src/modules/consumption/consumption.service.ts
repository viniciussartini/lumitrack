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
    MonthlyKwhForYear,
    ReactiveEnergyByWindow,
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
import type { TariffEnergyRateResponse } from "@/modules/distributor/tariff-catalog.repository.js"
import type {
    MeterDemandRollupRepository,
    MeterDemandRollupResponse,
} from "@/modules/meter/meter-demand-rollup.repository.js"
import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type {
    PldQuoteRepository,
    PldQuoteResponse,
} from "@/modules/pld-quote/pld-quote.repository.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import type {
    GroupADemandPostResult,
    GroupBEnergyPostInput,
} from "@/shared/tariff/tariff.service.js"
import {
    resolveContractedDemands,
    measuredDemandKwFor,
    type ContractedDemand,
} from "@/shared/tariff/contractedDemand.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidaysInRange } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"
import { toSkipTake, type Paginated } from "@/shared/pagination.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { logger } from "@/shared/logger/logger.js"
import type {
    AclSubmarket,
    ContractingEnvironment,
    TargetType,
    TariffPost,
    TariffSubgroup,
} from "@/generated/prisma/client.js"

const log = logger.child({ module: "ConsumptionService" })

// AclContract.energyPricePerMwh é negociado em R$/MWh (mesma unidade do
// handoff de design); TariffService opera em R$/kWh.
const MWH_TO_KWH = 1000

// Abaixo de meio centavo, os dois cenários exibem o mesmo valor em R$ (2
// casas decimais) — sem esta tolerância, um resíduo de ponto flutuante
// vindo da soma de vários meses (ex.: 0.00000000003) decidiria um veredito
// categórico ("X saiu mais barato") sobre uma diferença que o usuário nem
// consegue ver na tela. Usada pelos dois comparativos de propriedade
// (ACR × ACL e Convencional × Branca).
const VERDICT_EQUIVALENCE_TOLERANCE_BRL = 0.005

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

// Decomposição da conta binômia do Grupo A — presente só no bucket
// mensal de uma Propriedade Grupo A; ausente (undefined) para Grupo B e para
// qualquer outra combinação de granularidade/alvo, sem mudar o contrato de
// quem já consome `costBrl` sozinho.
export type GroupABreakdown = {
    contractedDemandKw: number
    demandByPost: GroupADemandPostResult[]
    demandBrl: number
    ultrapassagemBrl: number
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    ereByWindow: { window: "INDUCTIVE" | "CAPACITIVE"; excessKvarh: number; ereBrl: number }[]
    ereBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

// Decomposição da conta da Tarifa Branca (Grupo B) — presente só no bucket
// mensal de uma Propriedade Grupo B com groupBModality WHITE; ausente para
// Convencional e para qualquer outra combinação de granularidade/alvo.
export type GroupBWhiteBreakdown = {
    belowAvailabilityFloor: boolean
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    energyBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

export type ConsumptionBucketResponse = {
    bucketStart: Date
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
    groupA?: GroupABreakdown
    groupBWhite?: GroupBWhiteBreakdown
}

// Retorno interno do cálculo de custo de um bucket — carrega a decomposição
// do Grupo A ou da Tarifa Branca só quando ela existe (mês + Propriedade);
// os demais caminhos (Grupo B Convencional, ano, Área/Aparelho) só populam
// `totalBrl`.
type MonthCostResult = {
    totalBrl: number
    groupA?: GroupABreakdown
    groupBWhite?: GroupBWhiteBreakdown
}

export type ConsumptionListResponse = Paginated<ConsumptionBucketResponse> & {
    granularity: Granularity
}

// Item do resumo em lote — o consumo de quem tem medidor sempre volta; o
// custo só quando o cálculo existe para aquele alvo e tarifa (Área/Aparelho
// de Grupo A ou Tarifa Branca não têm custo próprio), por isso `costBrl` é
// opcional aqui e obrigatório em `ConsumptionBucketResponse`.
export type ConsumptionSummaryItem = Omit<ConsumptionBucketResponse, "costBrl"> & {
    id: string
    targetType: TargetType
    costBrl?: number
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
    /**
     * @param consumptionRepository - Acesso às leituras de medidor agregadas em baldes.
     * @param meterRepository - Resolve o medidor vinculado a um alvo.
     * @param propertyRepository - Resolve a propriedade raiz de um alvo e seus dados tarifários.
     * @param areaRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param deviceRepository - Usado por {@link resolveRootProperty} para subir a árvore até a propriedade.
     * @param distributorRepository - Resolve a distribuidora vinculada à propriedade, com suas tarifas.
     * @param tariffFlagRepository - Resolve a configuração vigente da bandeira tarifária.
     * @param tariffCatalogRepository - Resolve o catálogo de tarifas de energia/demanda do Grupo A.
     * @param meterDemandRollupRepository - Resolve a demanda medida por posto, usada para apurar ultrapassagem de demanda contratada.
     * @param aclContractRepository - Resolve o contrato de energia vigente de uma propriedade em ACL (TE negociada, no lugar da TE do catálogo).
     * @param pldQuoteRepository - Resolve o PLD do(s) submercado(s) dos contratos ACL envolvidos — contexto informativo da comparação ACR × ACL, não insumo do cálculo.
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
        private readonly meterDemandRollupRepository: MeterDemandRollupRepository,
        private readonly aclContractRepository: AclContractRepository,
        private readonly pldQuoteRepository: PldQuoteRepository,
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
                )
                return {
                    bucketStart: bucket.bucketStart,
                    kwhConsumed: bucket.kwhConsumed,
                    costBrl: cost.totalBrl,
                    avgPowerW: bucket.avgPowerW,
                    ...(cost.groupA && { groupA: cost.groupA }),
                    ...(cost.groupBWhite && { groupBWhite: cost.groupBWhite }),
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
            const costBrl = distributor
                ? await this.resolveSummaryItemCost(
                      id,
                      meter.id,
                      bucket,
                      granularity,
                      targetType,
                      property,
                      distributor,
                      flagPer100Kwh,
                  )
                : null

            items.push({
                id,
                targetType,
                bucketStart: bucket.bucketStart,
                kwhConsumed: bucket.kwhConsumed,
                avgPowerW: bucket.avgPowerW,
                ...(costBrl !== null && { costBrl }),
            })
        }

        return { items }
    }

    // Custo de 1 item de `summary()` — `null` quando o cálculo não existe ou
    // falha: o item continua no resultado com o consumo, só sem `costBrl`, e
    // os demais alvos do lote seguem respondendo. Grupo A e Tarifa Branca só
    // calculam custo em mês/ano + Propriedade — uma Área/Aparelho dessas
    // propriedades lança `ValidationError` ao tentar qualquer outra
    // combinação (`calculateBucketCost`), o caso esperado e silencioso;
    // qualquer outro erro é logado antes de omitir o custo, para não
    // mascarar uma falha real (catálogo ausente, timeout).
    private async resolveSummaryItemCost(
        targetId: string,
        meterId: string,
        bucket: { bucketStart: Date; kwhConsumed: number },
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number | null> {
        try {
            if (granularity === "year" && targetType === "PROPERTY") {
                return await this.calculateYearlyPropertyCost(
                    meterId,
                    bucket.bucketStart,
                    property,
                    distributor,
                    flagPer100Kwh,
                )
            }
            return (
                await this.calculateBucketCost(
                    meterId,
                    bucket,
                    granularity,
                    targetType,
                    property,
                    distributor,
                    flagPer100Kwh,
                )
            ).totalBrl
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

    // Granularidade "year" + alvo PROPERTY: o piso de disponibilidade é
    // mensal, então o custo anual correto é a soma de 12 custos mensais
    // (cada um com seu próprio piso/CIP) — nunca o piso aplicado uma
    // única vez sobre o total do ano. Batching por página inteira (1 query
    // pra todos os buckets de ano da página) — extraído do corpo de `list()`.
    // `summary()` tem seu equivalente em `calculateYearlyPropertyCost`, que
    // resolve o mesmo cálculo pra 1 bucket só.
    // Soma o custo de cada mês (já resolvido em lote por
    // `calculateGroupAMonthlyCosts`/`calculateGroupBWhiteMonthlyCosts`) no
    // bucket de ano correspondente — extraído porque os dois chamadores
    // (Grupo A e Branca) fazem exatamente essa mesma soma, só a origem do
    // Map de custo mensal muda.
    private sumMonthlyCostsIntoYearlyBuckets(
        monthlyRows: MonthlyKwhForYear[],
        monthlyCostByMonthMs: Map<number, MonthCostResult>,
    ): Map<number, number> {
        const yearlyPropertyCostByBucketMs = new Map<number, number>()
        for (const row of monthlyRows) {
            const key = row.yearBucket.getTime()
            const monthCost = monthlyCostByMonthMs.get(row.monthBucket.getTime())?.totalBrl ?? 0
            yearlyPropertyCostByBucketMs.set(
                key,
                (yearlyPropertyCostByBucketMs.get(key) ?? 0) + monthCost,
            )
        }
        return yearlyPropertyCostByBucketMs
    }

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
        const monthStarts = monthlyRows.map((r) => r.monthBucket)

        // Grupo A e Branca (Grupo B WHITE): 1 única consulta batching todos
        // os meses da página, em vez de 1 findKwhByPost por mês — até 12 por
        // bucket de ano, ~372 numa página cheia (31 anos).
        if (property.tariffGroup === "GROUP_A") {
            const monthlyCostByMonthMs = await this.calculateGroupAMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
                property.contractingEnvironment,
            )
            return this.sumMonthlyCostsIntoYearlyBuckets(monthlyRows, monthlyCostByMonthMs)
        }

        if (property.groupBModality === "WHITE") {
            const monthlyCostByMonthMs = await this.calculateGroupBWhiteMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
            )
            return this.sumMonthlyCostsIntoYearlyBuckets(monthlyRows, monthlyCostByMonthMs)
        }

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
                (yearlyPropertyCostByBucketMs.get(key) ?? 0) + monthCost.totalBrl,
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
    ): Promise<MonthCostResult> {
        if (granularity === "year" && targetType === "PROPERTY") {
            return { totalBrl: yearlyPropertyCostByBucketMs.get(bucket.bucketStart.getTime()) ?? 0 }
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
    // O cálculo ramifica por grupo tarifário/modalidade em vez de generalizar:
    // Grupo B Convencional usa o monômio de sempre (piso + tarifa plana da
    // distribuidora); Grupo B Branca precisa do consumo por posto, então
    // delega a `calculateGroupBWhiteMonthCost`; Grupo A precisa do consumo
    // por posto e da demanda contratada, então delega a
    // `calculateGroupAMonthCost` (que faz suas próprias consultas, já que
    // `kwhConsumed` aqui é um total do mês, não quebrado por posto).
    private async calculateMonthCost(
        meterId: string,
        monthStartLocal: Date,
        kwhConsumed: number,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
        if (property.tariffGroup === "GROUP_A") {
            return this.calculateGroupAMonthCost(
                meterId,
                monthStartLocal,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        if (property.groupBModality === "WHITE") {
            return this.calculateGroupBWhiteMonthCost(
                meterId,
                monthStartLocal,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        return {
            totalBrl: this.tariffService.calculateForProperty({
                kwhConsumed,
                electricalSystem: property.electricalSystem,
                publicLightingFeeBrl: property.publicLightingFeeBrl,
                tusdPerKwh: distributor.tusdPerKwh,
                tePerKwh: distributor.tePerKwh,
                icmsRate: distributor.icmsRate,
                pisRate: distributor.pisRate,
                cofinsRate: distributor.cofinsRate,
                flagPer100Kwh,
            }).totalBrl,
        }
    }

    // Resolve a janela de ponta da distribuidora, comum aos dois caminhos
    // (1 mês e o batching de vários) que calculam a conta da Branca —
    // extraído só pra não duplicar a validação.
    private assertGroupBWhitePeakWindow(distributor: DistributorResponse): PeakWindowConfig {
        if (distributor.peakWindowStartHour === null || distributor.peakWindowEndHour === null) {
            throw new ValidationError(
                "Distribuidora sem janela de ponta configurada — não é possível calcular a conta da Tarifa Branca",
            )
        }
        return {
            peakWindowStartHour: distributor.peakWindowStartHour,
            peakWindowEndHour: distributor.peakWindowEndHour,
        }
    }

    // Monta o resultado de 1 mês da Branca a partir do consumo por posto já
    // resolvido (com a tarifa do catálogo já aplicada) — extraído de
    // `calculateGroupBWhiteMonthCost` para o batching de vários meses
    // (`calculateGroupBWhiteMonthlyCosts`) reaproveitar a mesma tradução
    // para `MonthCostResult`, mesmo padrão de `buildGroupAMonthResult`.
    private buildGroupBWhiteMonthResult(
        energyByPost: GroupBEnergyPostInput[],
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): MonthCostResult {
        const result = this.tariffService.calculateForGroupBWhite({
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

        return {
            totalBrl: result.totalBrl,
            groupBWhite: {
                belowAvailabilityFloor: result.belowAvailabilityFloor,
                energyByPost: result.energyByPost,
                energyBrl: result.energyBrl,
                flagBrl: result.flagBrl,
                taxesBrl: result.taxesBrl,
                publicLightingFeeBrl: result.publicLightingFeeBrl,
            },
        }
    }

    // Resolve o consumo por posto de 1 mês (kWh já casado com a tarifa do
    // catálogo) a partir do Map devolvido por `findKwhByPost`/
    // `findKwhByPostGroupedByMonth` — extraído porque os dois caminhos (1
    // mês e o batching) fazem exatamente essa tradução, só a origem do Map
    // muda.
    private resolveGroupBWhiteEnergyByPost(
        kwhByPost: Map<TariffPost, number>,
        rateByPost: Map<TariffPost, TariffEnergyRateResponse>,
    ): GroupBEnergyPostInput[] {
        return Array.from(kwhByPost.entries()).map(([post, kwhConsumed]) => {
            const rate = rateByPost.get(post)
            if (!rate) {
                throw new NotFoundError(
                    "Catálogo da Tarifa Branca não cadastrado para esta distribuidora/posto",
                )
            }
            return { post, kwhConsumed, tusdPerKwh: rate.tusdPerKwh, tePerKwh: rate.tePerKwh }
        })
    }

    // Conta da Tarifa Branca (Grupo B) de 1 mês: consumo por posto (reaproveita
    // `findKwhByPost` com `includeIntermediate: true`, mesma extensão opt-in
    // que o Grupo A nunca aciona) × tarifa do catálogo `GroupBEnergyRate`.
    // Sem o piso de disponibilidade aplicado aqui — `TariffService.calculateForGroupBWhite`
    // decide internamente se o mês cai nele (piso cobrado pela Convencional).
    private async calculateGroupBWhiteMonthCost(
        meterId: string,
        monthStartLocal: Date,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
        const peakWindow = this.assertGroupBWhitePeakWindow(distributor)

        const monthEndLocal = new Date(
            Date.UTC(monthStartLocal.getUTCFullYear(), monthStartLocal.getUTCMonth() + 1, 1),
        )
        const from = fromSaoPauloLocal(monthStartLocal)
        const to = fromSaoPauloLocal(monthEndLocal)
        const holidays = getNationalHolidaysInRange(from, to)

        const [kwhByPostRows, energyRates] = await Promise.all([
            this.consumptionRepository.findKwhByPost(meterId, from, to, peakWindow, holidays, true),
            this.tariffCatalogRepository.findGroupBEnergyRates(distributor.id, "WHITE"),
        ])

        const rateByPost = new Map(energyRates.map((r) => [r.post, r]))
        const kwhByPost = new Map(kwhByPostRows.map((row) => [row.post, row.kwhConsumed]))
        const energyByPost = this.resolveGroupBWhiteEnergyByPost(kwhByPost, rateByPost)

        return this.buildGroupBWhiteMonthResult(energyByPost, property, distributor, flagPer100Kwh)
    }

    // Equivalente de `calculateGroupAMonthlyCosts` para a Branca: 1 única
    // consulta batching todos os meses da janela (`findKwhByPostGroupedByMonth`
    // com `includeIntermediate: true`), em vez de 1 `findKwhByPost` por mês —
    // até 12 por bucket de ano, ~372 numa página cheia (31 anos). Usada pelo
    // caminho anual de `list()`/`summary()`, que hoje é o único a pedir mais
    // de 1 mês da Branca de uma vez.
    private async calculateGroupBWhiteMonthlyCosts(
        meterId: string,
        monthStarts: Date[],
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<Map<number, MonthCostResult>> {
        const resultByMonthMs = new Map<number, MonthCostResult>()
        if (monthStarts.length === 0) return resultByMonthMs

        const peakWindow = this.assertGroupBWhitePeakWindow(distributor)
        const { from, to, holidays } = this.resolveMonthWindow(monthStarts)

        const [kwhByPostByMonth, energyRates] = await Promise.all([
            this.consumptionRepository.findKwhByPostGroupedByMonth(
                meterId,
                from,
                to,
                peakWindow,
                holidays,
                true,
            ),
            this.tariffCatalogRepository.findGroupBEnergyRates(distributor.id, "WHITE"),
        ])

        const rateByPost = new Map(energyRates.map((r) => [r.post, r]))
        const kwhByPostByMonthKey = new Map<number, Map<TariffPost, number>>()
        for (const row of kwhByPostByMonth) {
            const postMap = kwhByPostByMonthKey.get(row.monthBucket.getTime()) ?? new Map()
            postMap.set(row.post, row.kwhConsumed)
            kwhByPostByMonthKey.set(row.monthBucket.getTime(), postMap)
        }

        for (const monthStart of monthStarts) {
            const kwhByPost = kwhByPostByMonthKey.get(monthStart.getTime()) ?? new Map()
            const energyByPost = this.resolveGroupBWhiteEnergyByPost(kwhByPost, rateByPost)
            resultByMonthMs.set(
                monthStart.getTime(),
                this.buildGroupBWhiteMonthResult(
                    energyByPost,
                    property,
                    distributor,
                    flagPer100Kwh,
                ),
            )
        }

        return resultByMonthMs
    }

    // Conta binômia do Grupo A, modalidade Horária Verde — só ela está
    // implementada; Azul/Convencional falham fechado (Fase 20).
    // Falha fechada também sem janela de ponta configurada ou sem demanda
    // contratada, em vez de silenciosamente aplicar a fórmula errada.
    // Wrapper de 1 mês só sobre `calculateGroupAMonthlyCosts` — usado pelo
    // caminho de granularidade "month" (list()/summary() de um único mês),
    // que não tem o problema de N+1 que o caminho "year" tinha (era 1
    // `findKwhByPost` por mês, até 12 por ano por alvo).
    private async calculateGroupAMonthCost(
        meterId: string,
        monthStartLocal: Date,
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
        const resultByMonthMs = await this.calculateGroupAMonthlyCosts(
            meterId,
            [monthStartLocal],
            property,
            distributor,
            flagPer100Kwh,
            property.contractingEnvironment,
        )
        // Sempre presente: calculateGroupAMonthlyCosts preenche 1 entrada
        // para cada mês pedido, mesmo sem nenhuma leitura naquele mês (kWh
        // 0 em todos os postos — ainda assim paga demanda contratada).
        return resultByMonthMs.get(monthStartLocal.getTime())!
    }

    private assertGroupACalculable(
        property: PropertyResponse,
        distributor: DistributorResponse,
    ): {
        peakWindow: PeakWindowConfig
        tariffModality: "GREEN" | "BLUE"
        contractedDemands: ContractedDemand[]
        tariffSubgroup: TariffSubgroup
    } {
        if (distributor.peakWindowStartHour === null || distributor.peakWindowEndHour === null) {
            throw new ValidationError(
                "Distribuidora sem janela de ponta configurada — não é possível calcular a conta do Grupo A",
            )
        }
        if (property.tariffModality !== "GREEN" && property.tariffModality !== "BLUE") {
            throw new ValidationError(
                "Cálculo de conta do Grupo A ainda não suportado para esta modalidade tarifária",
            )
        }
        if (!property.tariffSubgroup) {
            throw new ValidationError("Propriedade do Grupo A sem subgrupo cadastrado")
        }

        return {
            peakWindow: {
                peakWindowStartHour: distributor.peakWindowStartHour,
                peakWindowEndHour: distributor.peakWindowEndHour,
            },
            tariffModality: property.tariffModality,
            contractedDemands: resolveContractedDemands(property, property.tariffModality),
            tariffSubgroup: property.tariffSubgroup,
        }
    }

    // Agrupa uma lista de linhas por um instante (em ms) — mesmo formato de
    // lookup usado para o kWh por posto×mês, extraído para não repetir o
    // laço a cada nova fonte de dado agregada por mês (demanda medida,
    // energia reativa).
    private groupRowsByMs<T>(rows: T[], getMs: (row: T) => number): Map<number, T[]> {
        const map = new Map<number, T[]>()
        for (const row of rows) {
            const ms = getMs(row)
            const bucket = map.get(ms) ?? []
            bucket.push(row)
            map.set(ms, bucket)
        }
        return map
    }

    // A norma de energia reativa excedente não diferencia a tarifa por posto
    // — corte de execução (ver tariff.service.ts): a TUSD de energia fora de
    // ponta cobre integralmente a janela capacitiva (0h-6h) e a maior parte
    // da indutiva (6h-24h), e o catálogo não tem uma tarifa reativa própria.
    private resolveReactiveTusdPerKvarh(energyRates: TariffEnergyRateResponse[]): number {
        const offPeakRate = energyRates.find((rate) => rate.post === "OFF_PEAK")
        if (!offPeakRate) {
            throw new NotFoundError(
                "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
            )
        }
        return offPeakRate.tusdPerKwh
    }

    // Entre os contratos sobrepostos da propriedade (ver
    // AclContractRepository.findOverlappingForProperty, já ordenados por
    // validFrom decrescente), o primeiro cuja vigência cobre o mês é o
    // vigente — havendo sobreposição de vigências (não impedida no
    // cadastro), o contrato mais recente prevalece.
    //
    // `undefined`, não exceção: um mês sem contrato vigente não é um erro do
    // pedido inteiro — é um mês em que a propriedade (hoje ACL) ainda não
    // tinha o contrato (ex.: histórico anterior a `validFrom`, ou um buraco
    // entre dois contratos). `resolveGroupAMonthEntry` decide o que fazer
    // com a ausência: degradar aquele mês para o tratamento do catálogo
    // regulado, não derrubar `calculateGroupAMonthlyCosts` inteiro — antes
    // disso, marcar uma propriedade Grupo A existente como ACL quebrava com
    // 404 a consulta de consumo de qualquer mês anterior ao contrato.
    private resolveAclContractForMonth(
        contracts: AclContractResponse[],
        monthStart: Date,
    ): AclContractResponse | undefined {
        return contracts.find(
            (c) => c.validFrom <= monthStart && (c.validTo === null || c.validTo >= monthStart),
        )
    }

    // Custo de 1 mês do Grupo A a partir do catálogo/consumo já resolvidos —
    // extraído do corpo de `calculateGroupAMonthlyCosts` (que resolve isso
    // em lote para vários meses) só para manter o teto de linhas/complexidade.
    // Junta cada demanda contratada com a tarifa do mesmo posto (catálogo) e
    // a demanda medida do mesmo posto (rollup do mês) — a entrada que
    // `TariffService.calculateForGroupA` espera. Falha fechado se o catálogo
    // não tiver a tarifa de algum posto contratado (nunca calcula com tarifa
    // ausente silenciosamente tratada como zero).
    private resolveDemandPostsForMonth(
        contractedDemands: ContractedDemand[],
        demandRates: Map<TariffPost | null, number>,
        rowsForMonth: MeterDemandRollupResponse[],
    ): {
        post: TariffPost | null
        contractedDemandKw: number
        measuredDemandKw: number
        tusdPerKw: number
    }[] {
        return contractedDemands.map((cd) => {
            const tusdPerKw = demandRates.get(cd.post)
            if (tusdPerKw === undefined) {
                throw new NotFoundError(
                    "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
                )
            }
            return {
                post: cd.post,
                contractedDemandKw: cd.contractedDemandKw,
                measuredDemandKw: measuredDemandKwFor(cd.post, rowsForMonth),
                tusdPerKw,
            }
        })
    }

    // Custo de 1 mês do Grupo A a partir do catálogo/consumo já resolvidos —
    // extraído do corpo de `calculateGroupAMonthlyCosts` (que resolve isso
    // em lote para vários meses) só para manter o teto de linhas/complexidade.
    private buildGroupAMonthResult(
        kwhByPostMap: Map<TariffPost, number>,
        contractedDemands: ContractedDemand[],
        demandRates: Map<TariffPost | null, number>,
        rowsForMonth: MeterDemandRollupResponse[],
        reactiveRowsForMonth: ReactiveEnergyByWindow[],
        tusdPerKvarh: number,
        energyRates: TariffEnergyRateResponse[],
        distributor: DistributorResponse,
        flagPer100Kwh: number,
        publicLightingFeeBrl: number | null,
        aclTePerKwh: number | undefined,
    ): MonthCostResult {
        // ACL substitui a TE do catálogo pela TE negociada no contrato — a
        // TUSD continua vindo do catálogo regulado (encargo de fio, devido
        // independente do ambiente de contratação). Corte de execução (ADR
        // do spike de mercado livre): TE única para o contrato, sem
        // diferenciar por posto — o documento de referência não modela um
        // preço negociado por posto horário.
        const energyByPost = energyRates.map((rate) => ({
            post: rate.post,
            kwhConsumed: kwhByPostMap.get(rate.post) ?? 0,
            tusdPerKwh: rate.tusdPerKwh,
            tePerKwh: aclTePerKwh ?? rate.tePerKwh,
        }))

        // `ConsumptionRepository` já apura o excedente por hora e soma só as
        // horas que excederam a razão de referência (uma hora boa nunca
        // compensa uma ruim). `TariffService.calculateReactiveWindow` espera
        // ativa/reativa separadas para aplicar essa mesma subtração — como o
        // excedente já vem pronto, `activeKwh: 0` faz `max(0, excedente − 0)`
        // devolver o próprio excedente sem recalcular nada.
        const reactiveWindows = reactiveRowsForMonth.map((row) => ({
            window: row.window,
            activeKwh: 0,
            reactiveKvarh: row.excessKvarh,
            tusdPerKvarh,
        }))

        const demandPosts = this.resolveDemandPostsForMonth(
            contractedDemands,
            demandRates,
            rowsForMonth,
        )

        const result = this.tariffService.calculateForGroupA({
            demandPosts,
            energyByPost,
            reactiveWindows,
            icmsRate: distributor.icmsRate,
            pisRate: distributor.pisRate,
            cofinsRate: distributor.cofinsRate,
            flagPer100Kwh,
            publicLightingFeeBrl,
        })

        // Soma das demandas contratadas — mantém o contrato existente da
        // Verde (1 posto, soma = o próprio valor) e dá um número agregado
        // não enganoso para a Azul enquanto a UI dedicada (que lê
        // `demandByPost`) não chega.
        const contractedDemandKw = contractedDemands.reduce(
            (sum, cd) => sum + cd.contractedDemandKw,
            0,
        )

        return {
            totalBrl: result.totalBrl,
            groupA: {
                contractedDemandKw,
                demandByPost: result.demandByPost,
                demandBrl: result.demandBrl,
                ultrapassagemBrl: result.ultrapassagemBrl,
                energyByPost: result.energyByPost,
                ereByWindow: result.ereByWindow,
                ereBrl: result.ereBrl,
                flagBrl: result.flagBrl,
                taxesBrl: result.taxesBrl,
                publicLightingFeeBrl: result.publicLightingFeeBrl,
            },
        }
    }

    // Verde/Convencional Binômia usam a demanda única do catálogo (post
    // nulo); a Azul usa as duas tarifas por posto. `Map` com chave `post`
    // (incluindo `null`) para o restante do cálculo tratar as duas formas
    // de forma genérica, sem `if` por modalidade fora deste método.
    private async resolveDemandRateMap(
        modality: "GREEN" | "BLUE",
        distributorId: string,
        tariffSubgroup: TariffSubgroup,
    ): Promise<Map<TariffPost | null, number>> {
        if (modality === "GREEN") {
            const rate = await this.tariffCatalogRepository.findSingleDemandRate(
                distributorId,
                tariffSubgroup,
                "GREEN",
            )
            if (!rate) {
                throw new NotFoundError(
                    "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
                )
            }
            return new Map([[null, rate.tusdPerKw]])
        }

        const rates = await this.tariffCatalogRepository.findDemandRatesByPost(
            distributorId,
            tariffSubgroup,
            "BLUE",
        )
        if (rates.length === 0) {
            throw new NotFoundError(
                "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
            )
        }
        return new Map(rates.map((r) => [r.post as TariffPost | null, r.tusdPerKw]))
    }

    // `monthStarts` vêm de date_trunc('month', localTsExpr()) — os campos de
    // calendário (ano/mês) já são os locais corretos, só rotulados como UTC
    // (mesmo truque de consumption.repository.ts). `fromSaoPauloLocal`
    // converte para o instante UTC real que findKwhByPostGroupedByMonth
    // espera (mesmo idioma do DemandRollupScheduler). Compartilhado pelo
    // batching mensal do Grupo A e da Branca (Grupo B) — `periodStarts` só
    // interessa ao Grupo A (demanda contratada), mas calculá-lo aqui é mais
    // barato que duplicar a função por um campo que o outro chamador ignora.
    private resolveMonthWindow(monthStarts: Date[]): {
        minMonthStart: Date
        maxMonthEnd: Date
        from: Date
        to: Date
        holidays: Date[]
        periodStarts: Date[]
    } {
        const monthMs = monthStarts.map((d) => d.getTime())
        const minMonthStart = new Date(Math.min(...monthMs))
        const maxMonthStart = new Date(Math.max(...monthMs))
        const maxMonthEnd = new Date(
            Date.UTC(maxMonthStart.getUTCFullYear(), maxMonthStart.getUTCMonth() + 1, 1),
        )
        const from = fromSaoPauloLocal(minMonthStart)
        const to = fromSaoPauloLocal(maxMonthEnd)
        const holidays = getNationalHolidaysInRange(from, to)

        // MeterDemandRollup.periodStart é o instante UTC real do início do
        // mês local (mesma conversão que DemandRollupScheduler usa para
        // escrever), não o valor "rotulado como UTC" de `monthStarts" — daí
        // o `fromSaoPauloLocal` por mês, igual ao par `from`/`to` acima.
        const periodStarts = monthStarts.map((d) => fromSaoPauloLocal(d))

        return { minMonthStart, maxMonthEnd, from, to, holidays, periodStarts }
    }

    // `environment` é explícito (não lido de `property.contractingEnvironment`
    // direto) para que `compareAclToAcr` recalcule o mesmo consumo real nos
    // dois cenários — o cenário "e se fosse ACR"/"e se fosse ACL" não muda o
    // cadastro da propriedade, só o parâmetro desta chamada. Os demais
    // chamadores passam o ambiente real da propriedade, comportamento
    // idêntico ao anterior.
    private async calculateGroupAMonthlyCosts(
        meterId: string,
        monthStarts: Date[],
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
        environment: ContractingEnvironment,
    ): Promise<Map<number, MonthCostResult>> {
        const resultByMonthMs = new Map<number, MonthCostResult>()
        if (monthStarts.length === 0) return resultByMonthMs

        const { peakWindow, tariffModality, contractedDemands, tariffSubgroup } =
            this.assertGroupACalculable(property, distributor)

        const { minMonthStart, maxMonthEnd, from, to, holidays, periodStarts } =
            this.resolveMonthWindow(monthStarts)

        // ACL não incide bandeira (ADR-0021 — nem sobre TUSD, nem sobre TE) e
        // troca a TE do catálogo pela TE negociada no `AclContract` vigente
        // de cada mês — decidido por mês em `resolveGroupAMonthEntry`, não
        // aqui: `isAcl` só controla se vale a pena buscar contratos (uma
        // propriedade ACR nunca tem), o tratamento efetivo de cada mês
        // depende de haver contrato cobrindo aquele mês especificamente.
        // `validFrom`/`validTo` são datas de calendário (entrada do usuário,
        // não convertidas por `fromSaoPauloLocal`), daí consultar com
        // `minMonthStart`/`maxMonthEnd` — os mesmos "rotulados como UTC" que
        // `monthStarts` já usa — em vez de `from`/`to`.
        const isAcl = environment === "ACL"

        const [
            kwhByPostByMonth,
            energyRates,
            demandRates,
            demandRollups,
            reactiveByMonth,
            aclContracts,
        ] = await Promise.all([
            this.consumptionRepository.findKwhByPostGroupedByMonth(
                meterId,
                from,
                to,
                peakWindow,
                holidays,
            ),
            this.tariffCatalogRepository.findEnergyRates(
                distributor.id,
                tariffSubgroup,
                tariffModality,
            ),
            this.resolveDemandRateMap(tariffModality, distributor.id, tariffSubgroup),
            this.meterDemandRollupRepository.findByMeterAndPeriods(meterId, periodStarts),
            this.consumptionRepository.findReactiveEnergyByWindowGroupedByMonth(meterId, from, to),
            isAcl
                ? this.aclContractRepository.findOverlappingForProperty(
                      property.id,
                      minMonthStart,
                      maxMonthEnd,
                  )
                : Promise.resolve<AclContractResponse[]>([]),
        ])

        if (energyRates.length === 0) {
            throw new NotFoundError(
                "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
            )
        }
        const tusdPerKvarh = this.resolveReactiveTusdPerKvarh(energyRates)

        const kwhByPostByMonthKey = new Map<number, Map<TariffPost, number>>()
        for (const row of kwhByPostByMonth) {
            const postMap = kwhByPostByMonthKey.get(row.monthBucket.getTime()) ?? new Map()
            postMap.set(row.post, row.kwhConsumed)
            kwhByPostByMonthKey.set(row.monthBucket.getTime(), postMap)
        }

        const demandRollupsByPeriodMs = this.groupRowsByMs(demandRollups, (r) =>
            r.periodStart.getTime(),
        )
        const reactiveByMonthMs = this.groupRowsByMs(reactiveByMonth, (r) =>
            r.monthBucket.getTime(),
        )

        for (const monthStart of monthStarts) {
            resultByMonthMs.set(
                monthStart.getTime(),
                this.resolveGroupAMonthEntry(monthStart, {
                    kwhByPostByMonthKey,
                    demandRollupsByPeriodMs,
                    reactiveByMonthMs,
                    aclContracts,
                    isAcl,
                    contractedDemands,
                    demandRates,
                    tusdPerKvarh,
                    energyRates,
                    distributor,
                    flagPer100Kwh,
                    publicLightingFeeBrl: property.publicLightingFeeBrl,
                }),
            )
        }

        return resultByMonthMs
    }

    // Corpo do laço de `calculateGroupAMonthlyCosts` — extraído só para
    // manter o teto de linhas/complexidade, mesmo padrão de
    // `resolveMonthWindow`/`resolveDemandPostsForMonth`. Um único
    // parâmetro de contexto (em vez de 12 posicionais) porque tudo aqui já
    // foi resolvido em lote por mês pelo chamador.
    private resolveGroupAMonthEntry(
        monthStart: Date,
        ctx: {
            kwhByPostByMonthKey: Map<number, Map<TariffPost, number>>
            demandRollupsByPeriodMs: Map<number, MeterDemandRollupResponse[]>
            reactiveByMonthMs: Map<number, ReactiveEnergyByWindow[]>
            aclContracts: AclContractResponse[]
            isAcl: boolean
            contractedDemands: ContractedDemand[]
            demandRates: Map<TariffPost | null, number>
            tusdPerKvarh: number
            energyRates: TariffEnergyRateResponse[]
            distributor: DistributorResponse
            flagPer100Kwh: number
            publicLightingFeeBrl: number | null
        },
    ): MonthCostResult {
        const kwhByPostMap = ctx.kwhByPostByMonthKey.get(monthStart.getTime()) ?? new Map()
        const rowsForMonth =
            ctx.demandRollupsByPeriodMs.get(fromSaoPauloLocal(monthStart).getTime()) ?? []
        const reactiveRowsForMonth = ctx.reactiveByMonthMs.get(monthStart.getTime()) ?? []

        // O mês só usa o tratamento ACL (TE do contrato, sem bandeira) se
        // `isAcl` pediu e um contrato de fato cobre este mês — sem
        // cobertura (histórico anterior a `validFrom`, ou um buraco entre
        // dois contratos), o mês degrada para o catálogo regulado com
        // bandeira normal, em vez de derrubar o lote inteiro com erro.
        const contractForMonth = ctx.isAcl
            ? this.resolveAclContractForMonth(ctx.aclContracts, monthStart)
            : undefined
        const aclTePerKwh = contractForMonth
            ? contractForMonth.energyPricePerMwh / MWH_TO_KWH
            : undefined
        const monthFlagPer100Kwh = contractForMonth ? 0 : ctx.flagPer100Kwh

        return this.buildGroupAMonthResult(
            kwhByPostMap,
            ctx.contractedDemands,
            ctx.demandRates,
            rowsForMonth,
            reactiveRowsForMonth,
            ctx.tusdPerKvarh,
            ctx.energyRates,
            ctx.distributor,
            monthFlagPer100Kwh,
            ctx.publicLightingFeeBrl,
            aclTePerKwh,
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
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
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

        // Mesma disciplina de falha fechada da Azul acima: o consumo por
        // posto da Branca só existe agregado pelo mês inteiro da Propriedade
        // (caminho acima) — minuto/hora/dia e Área/Aparelho aplicariam a
        // tarifa plana da Convencional a uma propriedade que não está nela,
        // uma conta silenciosamente errada.
        if (property.groupBModality === "WHITE") {
            throw new ValidationError(
                "Detalhamento de sub-nível ou sub-período ainda não suportado para propriedades na Tarifa Branca",
            )
        }

        // minute/hour/day (qualquer alvo) e month/year (AREA/DEVICE): sem
        // piso nem CIP — apenas energia + bandeira + tributos sobre o
        // consumo real do bucket.
        return {
            totalBrl: this.calculateSubTargetCost(bucket.kwhConsumed, distributor, flagPer100Kwh),
        }
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

        // Mesmo batching de computeYearlyPropertyCosts: 1 consulta para os
        // até 12 meses do ano, em vez de 1 findKwhByPost por mês — aqui
        // importa ainda mais, porque summary() chama isto por ALVO da lista
        // comparada (N alvos × até 12 meses, sem o batch).
        if (property.tariffGroup === "GROUP_A") {
            const monthlyCostByMonthMs = await this.calculateGroupAMonthlyCosts(
                meterId,
                monthlyRows.map((r) => r.monthBucket),
                property,
                distributor,
                flagPer100Kwh,
                property.contractingEnvironment,
            )

            let sum = 0
            for (const cost of monthlyCostByMonthMs.values()) sum += cost.totalBrl
            return sum
        }

        // Mesmo motivo do Grupo A acima, agora pra Branca — `summary()` fica
        // ainda mais sensível ao N+1 (repete por ALVO da lista comparada).
        if (property.groupBModality === "WHITE") {
            const monthlyCostByMonthMs = await this.calculateGroupBWhiteMonthlyCosts(
                meterId,
                monthlyRows.map((r) => r.monthBucket),
                property,
                distributor,
                flagPer100Kwh,
            )

            let sum = 0
            for (const cost of monthlyCostByMonthMs.values()) sum += cost.totalBrl
            return sum
        }

        let sum = 0
        for (const row of monthlyRows) {
            const monthCost = await this.calculateMonthCost(
                meterId,
                row.monthBucket,
                row.kwhConsumed,
                property,
                distributor,
                flagPer100Kwh,
            )
            sum += monthCost.totalBrl
        }
        return sum
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
    private async calculateBrancaComparisonMonth(
        meterId: string,
        monthStart: Date,
        property: PropertyResponse,
        distributor: DistributorResponse,
        peakWindow: PeakWindowConfig,
        rateByPost: Map<TariffPost, TariffEnergyRateResponse>,
        flagPer100Kwh: number,
    ): Promise<BrancaComparisonMonthResult> {
        const monthEndLocal = new Date(
            Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
        )
        const from = fromSaoPauloLocal(monthStart)
        const to = fromSaoPauloLocal(monthEndLocal)
        const holidays = getNationalHolidaysInRange(from, to)

        const kwhByPost = await this.consumptionRepository.findKwhByPost(
            meterId,
            from,
            to,
            peakWindow,
            holidays,
            true,
        )

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
            (monthStart) =>
                this.resolveAclContractForMonth(contractsInRange, monthStart) !== undefined,
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
            this.calculateGroupAMonthlyCosts(
                meter.id,
                comparableMonthStarts,
                property,
                distributor,
                flagPer100Kwh,
                "ACR",
            ),
            this.calculateGroupAMonthlyCosts(
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

        const monthStarts = this.monthStartsInRange(from, to)
        const months = await Promise.all(
            monthStarts.map((monthStart) =>
                this.calculateBrancaComparisonMonth(
                    meter.id,
                    monthStart,
                    property,
                    distributor,
                    peakWindow,
                    rateByPost,
                    flagPer100Kwh,
                ),
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
