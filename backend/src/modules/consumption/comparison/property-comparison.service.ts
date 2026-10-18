import {
    compareAclToAcrQuerySchema,
    compareBrancaToConvencionalQuerySchema,
} from "@/modules/consumption/consumption.schema.js"
import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import {
    groupRowsByMs,
    resolveAclContractForMonth,
    resolveMonthWindow,
} from "@/modules/consumption/billing/monthWindow.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type {
    TariffCatalogRepository,
    TariffEnergyRateResponse,
} from "@/modules/distributor/tariff-catalog.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PldQuoteRepository,
    PldQuoteResponse,
} from "@/modules/pld-quote/pld-quote.repository.js"
import type {
    PropertyRepository,
    PropertyWithoutAddress,
} from "@/modules/property/property.repository.js"
import type { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { loadOwnedPropertyBillingContext } from "@/shared/propertyBillingContext.js"
import type { TariffService } from "@/shared/tariff/tariff.service.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { PropertyBillingContextRepositories } from "@/shared/propertyBillingContext.js"
import type { AclSubmarket, TariffPost } from "@/generated/prisma/client.js"

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

// A comparação ACR × ACL só existe para propriedade já no ambiente livre.
function assertAclEnvironment(property: PropertyWithoutAddress): void {
    if (property.contractingEnvironment !== "ACL") {
        throw new ValidationError(
            "Comparação ACR × ACL só está disponível para propriedades no ambiente de contratação livre (ACL)",
        )
    }
}

// Comparar exigiria migrar o cadastro para ter o catálogo por posto resolvido,
// então só propriedade já na Tarifa Branca chega aqui.
function assertWhiteTariff(property: PropertyWithoutAddress): void {
    if (property.groupBModality !== "WHITE") {
        throw new ValidationError(
            "Comparação Convencional × Branca só está disponível para propriedades na Tarifa Branca (Grupo B)",
        )
    }
}

// Sem janela de ponta não há como separar os postos: falha fechada.
function resolveWhitePeakWindow(distributor: DistributorResponse): PeakWindowConfig {
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

/**
 * Comparações de custo de uma propriedade sobre o consumo real medido: ACR ×
 * ACL (Grupo A no Mercado Livre) e Convencional × Branca (Grupo B). Cada uma
 * recalcula o mesmo consumo nos dois cenários, mês a mês, para a mesma janela.
 */
export class PropertyComparisonService {
    private readonly billingContextRepositories: PropertyBillingContextRepositories

    /**
     * @param propertyRepository - Resolve a propriedade e confere o dono.
     * @param meterRepository - Resolve o medidor da propriedade.
     * @param distributorRepository - Resolve a distribuidora (tarifas e janela de ponta).
     * @param tariffFlagRepository - Resolve a bandeira tarifária vigente.
     * @param tariffCatalogRepository - Resolve o catálogo de tarifas da Branca.
     * @param aclContractRepository - Resolve os contratos de energia do Mercado Livre.
     * @param pldQuoteRepository - Resolve o PLD dos submercados dos contratos (contexto informativo, não insumo do cálculo).
     * @param consumptionRepository - Resolve o consumo por posto de cada mês.
     * @param groupABillCalculator - Calcula a conta do Grupo A nos dois ambientes de contratação.
     * @param tariffService - Aplica as fórmulas da conta Convencional e da Branca.
     */
    constructor(
        propertyRepository: PropertyRepository,
        meterRepository: MeterRepository,
        distributorRepository: DistributorRepository,
        tariffFlagRepository: TariffFlagRepository,
        private readonly tariffCatalogRepository: TariffCatalogRepository,
        private readonly aclContractRepository: AclContractRepository,
        private readonly pldQuoteRepository: PldQuoteRepository,
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly groupABillCalculator: GroupABillCalculator,
        private readonly tariffService: TariffService,
    ) {
        this.billingContextRepositories = {
            propertyRepository,
            meterRepository,
            distributorRepository,
            tariffFlagRepository,
        }
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

        const { property, meterId, distributor, flagPer100Kwh } =
            await loadOwnedPropertyBillingContext(
                userId,
                propertyId,
                this.billingContextRepositories,
                { property: assertAclEnvironment },
            )

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
        const months = await this.calculateAclComparisonMonths(
            meterId,
            comparableMonthStarts,
            property,
            distributor,
            flagPer100Kwh,
        )

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

    // Os dois cenários sobre o mesmo consumo real, mês a mês: o cadastro da
    // propriedade não muda, só o ambiente de contratação passado à calculadora.
    private async calculateAclComparisonMonths(
        meterId: string,
        monthStarts: Date[],
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<AclComparisonMonthResult[]> {
        const [acrByMonth, aclByMonth] = await Promise.all([
            this.groupABillCalculator.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
                "ACR",
            ),
            this.groupABillCalculator.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
                "ACL",
            ),
        ])

        return monthStarts.map((monthStart) => {
            const acrBrl = acrByMonth.get(monthStart.getTime())!.totalBrl
            const aclBrl = aclByMonth.get(monthStart.getTime())!.totalBrl
            return { monthStart, acrBrl, aclBrl, diffBrl: acrBrl - aclBrl }
        })
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

        const { property, meterId, distributor, flagPer100Kwh } =
            await loadOwnedPropertyBillingContext(
                userId,
                propertyId,
                this.billingContextRepositories,
                {
                    property: assertWhiteTariff,
                    // Valida a janela de ponta logo depois de achar a distribuidora,
                    // para esse erro vir antes do de bandeira; o valor é lido abaixo.
                    distributor: (found) => void resolveWhitePeakWindow(found),
                },
            )
        const peakWindow = resolveWhitePeakWindow(distributor)
        const rateByPost = await this.loadWhiteRateByPost(distributor.id)

        // 1 consulta para todos os meses da janela; mês sem leitura não tem
        // linha e entra como consumo zero em todos os postos.
        const monthStarts = this.monthStartsInRange(from, to)
        const window = resolveMonthWindow(monthStarts)
        const kwhByPostRows = await this.consumptionRepository.findKwhByPostGroupedByMonth(
            meterId,
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

    // Tarifas da Branca por posto; sem catálogo cadastrado a comparação falha
    // fechada, em vez de tratar a tarifa ausente como zero.
    private async loadWhiteRateByPost(
        distributorId: string,
    ): Promise<Map<TariffPost, TariffEnergyRateResponse>> {
        const energyRates = await this.tariffCatalogRepository.findGroupBEnergyRates(
            distributorId,
            "WHITE",
        )
        if (energyRates.length === 0) {
            throw new NotFoundError(
                "Catálogo da Tarifa Branca não cadastrado para esta distribuidora",
            )
        }
        return new Map(energyRates.map((rate) => [rate.post, rate]))
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
}
