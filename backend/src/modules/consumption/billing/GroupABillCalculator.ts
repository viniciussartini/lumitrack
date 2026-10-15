import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type { MonthCostResult } from "@/modules/consumption/billing/billing.types.js"
import {
    groupRowsByMs,
    resolveAclContractForMonth,
    resolveMonthWindow,
} from "@/modules/consumption/billing/monthWindow.js"
import type {
    ConsumptionRepository,
    ReactiveEnergyByWindow,
} from "@/modules/consumption/consumption.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import type { TariffEnergyRateResponse } from "@/modules/distributor/tariff-catalog.repository.js"
import type {
    MeterDemandRollupRepository,
    MeterDemandRollupResponse,
} from "@/modules/meter/meter-demand-rollup.repository.js"
import type { PropertyWithoutAddress } from "@/modules/property/property.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import {
    resolveContractedDemands,
    measuredDemandKwFor,
    type ContractedDemand,
} from "@/shared/tariff/contractedDemand.js"
import type { TariffService } from "@/shared/tariff/tariff.service.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"
import type {
    ContractingEnvironment,
    TariffPost,
    TariffSubgroup,
} from "@/generated/prisma/client.js"

const MWH_TO_KWH = 1000

// Consumo por posto indexado pelo instante do mês (ms).
function indexKwhByPostByMonth(
    rows: { monthBucket: Date; post: TariffPost; kwhConsumed: number }[],
): Map<number, Map<TariffPost, number>> {
    const index = new Map<number, Map<TariffPost, number>>()
    for (const row of rows) {
        const postMap = index.get(row.monthBucket.getTime()) ?? new Map()
        postMap.set(row.post, row.kwhConsumed)
        index.set(row.monthBucket.getTime(), postMap)
    }
    return index
}

/**
 * Calculadora da conta binômia do Grupo A (Horária Verde e Azul), com o
 * tratamento do Mercado Livre (TE do contrato, sem bandeira) nos meses
 * cobertos por um contrato ACL. Não conhece buckets nem paginação: recebe
 * meses e devolve o custo de cada um.
 */
export class GroupABillCalculator {
    /**
     * @param consumptionRepository - Resolve o consumo por posto e a energia reativa por mês.
     * @param tariffCatalogRepository - Resolve as tarifas de energia e de demanda do Grupo A.
     * @param meterDemandRollupRepository - Resolve a demanda medida por posto e mês.
     * @param aclContractRepository - Resolve os contratos ACL que cobrem os meses.
     * @param tariffService - Aplica a fórmula da conta.
     */
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly tariffCatalogRepository: TariffCatalogRepository,
        private readonly meterDemandRollupRepository: MeterDemandRollupRepository,
        private readonly aclContractRepository: AclContractRepository,
        private readonly tariffService: TariffService,
    ) {}

    /**
     * Conta do Grupo A de um único mês — wrapper de {@link calculateMonthlyCosts}
     * para quem tem 1 bucket por alvo (o resumo), no ambiente de contratação
     * cadastrado na propriedade. Nas modalidades Horária Verde e Azul; a
     * Convencional Binômia não tem cálculo e falha fechada, e também falham
     * fechados a distribuidora sem janela de ponta e a propriedade sem demanda
     * contratada, em vez de aplicar a fórmula errada.
     *
     * @param meterId - Medidor da propriedade.
     * @param monthStartLocal - Início do mês, na convenção "hora local nos getters UTC".
     * @param property - Propriedade do Grupo A.
     * @param distributor - Distribuidora (tributos, janela de ponta e catálogo).
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo e a decomposição da conta do mês.
     */
    async calculateMonth(
        meterId: string,
        monthStartLocal: Date,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
        const resultByMonthMs = await this.calculateMonthlyCosts(
            meterId,
            [monthStartLocal],
            property,
            distributor,
            flagPer100Kwh,
            property.contractingEnvironment,
        )
        // Sempre presente: calculateMonthlyCosts preenche 1 entrada
        // para cada mês pedido, mesmo sem nenhuma leitura naquele mês (kWh
        // 0 em todos os postos — ainda assim paga demanda contratada).
        return resultByMonthMs.get(monthStartLocal.getTime())!
    }

    private assertGroupACalculable(
        property: PropertyWithoutAddress,
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

    // Custo de 1 mês do Grupo A a partir do catálogo/consumo já resolvidos —
    // extraído do corpo de `calculateMonthlyCosts` (que resolve isso
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
    // extraído do corpo de `calculateMonthlyCosts` (que resolve isso
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

    /**
     * Conta do Grupo A de vários meses, com uma rodada de consultas para a
     * janela inteira (consumo por posto, catálogo, demanda medida, reativa e
     * contratos ACL), e uma entrada para cada mês pedido, mesmo sem leitura
     * (a demanda contratada é paga do mesmo jeito).
     *
     * `environment` é explícito (não lido de `property.contractingEnvironment`
     * direto) para que a comparação ACR × ACL recalcule o mesmo consumo real
     * nos dois cenários: o cenário "e se fosse ACR"/"e se fosse ACL" não muda
     * o cadastro da propriedade, só o parâmetro desta chamada.
     *
     * @param meterId - Medidor da propriedade.
     * @param monthStarts - Inícios dos meses, na convenção "hora local nos getters UTC".
     * @param property - Propriedade do Grupo A.
     * @param distributor - Distribuidora (tributos, janela de ponta e catálogo).
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @param environment - Ambiente de contratação a calcular (ACR ou ACL).
     * @returns O custo e a decomposição de cada mês, por instante do mês em ms.
     */
    async calculateMonthlyCosts(
        meterId: string,
        monthStarts: Date[],
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
        environment: ContractingEnvironment,
    ): Promise<Map<number, MonthCostResult>> {
        const resultByMonthMs = new Map<number, MonthCostResult>()
        if (monthStarts.length === 0) return resultByMonthMs

        const { peakWindow, tariffModality, contractedDemands, tariffSubgroup } =
            this.assertGroupACalculable(property, distributor)

        // ACL não incide bandeira (ADR-0021 — nem sobre TUSD, nem sobre TE) e
        // troca a TE do catálogo pela TE negociada no `AclContract` vigente
        // de cada mês — decidido por mês em `resolveGroupAMonthEntry`, não
        // aqui: `isAcl` só controla se vale a pena buscar contratos (uma
        // propriedade ACR nunca tem), o tratamento efetivo de cada mês
        // depende de haver contrato cobrindo aquele mês especificamente.
        const isAcl = environment === "ACL"

        const {
            kwhByPostByMonth,
            energyRates,
            demandRates,
            demandRollups,
            reactiveByMonth,
            aclContracts,
        } = await this.loadMonthlyInputs({
            meterId,
            property,
            distributor,
            peakWindow,
            tariffModality,
            tariffSubgroup,
            isAcl,
            window: resolveMonthWindow(monthStarts),
        })

        if (energyRates.length === 0) {
            throw new NotFoundError(
                "Catálogo tarifário do Grupo A não cadastrado para esta distribuidora/subgrupo/modalidade",
            )
        }
        const tusdPerKvarh = this.resolveReactiveTusdPerKvarh(energyRates)

        const demandRollupsByPeriodMs = groupRowsByMs(demandRollups, (r) => r.periodStart.getTime())
        const reactiveByMonthMs = groupRowsByMs(reactiveByMonth, (r) => r.monthBucket.getTime())

        for (const monthStart of monthStarts) {
            resultByMonthMs.set(
                monthStart.getTime(),
                this.resolveGroupAMonthEntry(monthStart, {
                    kwhByPostByMonthKey: indexKwhByPostByMonth(kwhByPostByMonth),
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

    // Uma rodada de consultas para a janela inteira, em paralelo. `validFrom`/
    // `validTo` dos contratos são datas de calendário (entrada do usuário, não
    // convertidas por `fromSaoPauloLocal`), daí consultar com
    // `minMonthStart`/`maxMonthEnd` — os mesmos "rotulados como UTC" que
    // `monthStarts` já usa — em vez de `from`/`to`.
    private async loadMonthlyInputs(args: {
        meterId: string
        property: PropertyWithoutAddress
        distributor: DistributorResponse
        peakWindow: PeakWindowConfig
        tariffModality: "GREEN" | "BLUE"
        tariffSubgroup: TariffSubgroup
        isAcl: boolean
        window: ReturnType<typeof resolveMonthWindow>
    }) {
        const { meterId, property, distributor, peakWindow, tariffModality, tariffSubgroup } = args
        const { minMonthStart, maxMonthEnd, from, to, holidays, periodStarts } = args.window

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
            args.isAcl
                ? this.aclContractRepository.findOverlappingForProperty(
                      property.id,
                      minMonthStart,
                      maxMonthEnd,
                  )
                : Promise.resolve<AclContractResponse[]>([]),
        ])

        return {
            kwhByPostByMonth,
            energyRates,
            demandRates,
            demandRollups,
            reactiveByMonth,
            aclContracts,
        }
    }

    // Corpo do laço de `calculateMonthlyCosts` — extraído só para
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
            ? resolveAclContractForMonth(ctx.aclContracts, monthStart)
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
}
