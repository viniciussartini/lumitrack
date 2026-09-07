import {
    listConsumptionQuerySchema,
    consumptionSummaryQuerySchema,
    type Granularity,
} from "@/modules/consumption/consumption.schema.js"
import type {
    ConsumptionBucket,
    ConsumptionRepository,
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
import { TariffService } from "@/shared/tariff/tariff.service.js"
import type { GroupADemandPostResult } from "@/shared/tariff/tariff.service.js"
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
import type { TargetType, TariffPost, TariffSubgroup } from "@/generated/prisma/client.js"

const log = logger.child({ module: "ConsumptionService" })

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

export type ConsumptionBucketResponse = {
    bucketStart: Date
    kwhConsumed: number
    costBrl: number
    avgPowerW: number
    groupA?: GroupABreakdown
}

// Retorno interno do cálculo de custo de um bucket — carrega a decomposição
// do Grupo A só quando ela existe (mês + Propriedade); os demais caminhos
// (Grupo B, ano, Área/Aparelho) só populam `totalBrl`.
type MonthCostResult = {
    totalBrl: number
    groupA?: GroupABreakdown
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
     * @param tariffCatalogRepository - Resolve o catálogo de tarifas de energia/demanda do Grupo A.
     * @param meterDemandRollupRepository - Resolve a demanda medida por posto, usada para apurar ultrapassagem de demanda contratada.
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
            if (!distributor) continue

            const costBrl = await this.resolveSummaryItemCost(
                id,
                meter.id,
                bucket,
                granularity,
                targetType,
                property,
                distributor,
                flagPer100Kwh,
            )
            if (costBrl === null) continue

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

    // Custo de 1 item de `summary()` — `null` quando o cálculo falha (mesma
    // tolerância já aplicada acima a "sem medidor"/"sem distribuidora": o
    // item some do resultado, os demais alvos do lote continuam
    // respondendo). Grupo A só calcula custo em mês/ano + Propriedade —
    // uma Área/Aparelho de uma propriedade Grupo A lança `ValidationError`
    // ao tentar qualquer outra combinação (`calculateBucketCost`), o caso
    // esperado e silencioso; qualquer outro erro é logado antes de excluir
    // o item, para não mascarar uma falha real (catálogo ausente, timeout).
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
                    "Falha inesperada ao calcular custo — item excluído do resumo",
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

        // Grupo A: 1 única consulta batching todos os meses da página (ver
        // calculateGroupAMonthlyCosts), em vez de 1 findKwhByPost por mês —
        // até 12 por bucket de ano, ~372 numa página cheia (31 anos).
        if (property.tariffGroup === "GROUP_A") {
            const monthlyCostByMonthMs = await this.calculateGroupAMonthlyCosts(
                meterId,
                monthlyRows.map((r) => r.monthBucket),
                property,
                distributor,
                flagPer100Kwh,
            )

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
    // O cálculo ramifica por grupo tarifário em vez de generalizar:
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
    ): MonthCostResult {
        const energyByPost = energyRates.map((rate) => ({
            post: rate.post,
            kwhConsumed: kwhByPostMap.get(rate.post) ?? 0,
            tusdPerKwh: rate.tusdPerKwh,
            tePerKwh: rate.tePerKwh,
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

    private async calculateGroupAMonthlyCosts(
        meterId: string,
        monthStarts: Date[],
        property: PropertyResponse,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<Map<number, MonthCostResult>> {
        const resultByMonthMs = new Map<number, MonthCostResult>()
        if (monthStarts.length === 0) return resultByMonthMs

        const { peakWindow, tariffModality, contractedDemands, tariffSubgroup } =
            this.assertGroupACalculable(property, distributor)

        // `monthStarts` vêm de date_trunc('month', localTsExpr()) — os
        // campos de calendário (ano/mês) já são os locais corretos, só
        // rotulados como UTC (mesmo truque de consumption.repository.ts).
        // `fromSaoPauloLocal` converte para o instante UTC real que
        // findKwhByPostGroupedByMonth espera (mesmo idioma do DemandRollupScheduler).
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

        const [kwhByPostByMonth, energyRates, demandRates, demandRollups, reactiveByMonth] =
            await Promise.all([
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
                this.consumptionRepository.findReactiveEnergyByWindowGroupedByMonth(
                    meterId,
                    from,
                    to,
                ),
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
            const kwhByPostMap = kwhByPostByMonthKey.get(monthStart.getTime()) ?? new Map()
            const rowsForMonth =
                demandRollupsByPeriodMs.get(fromSaoPauloLocal(monthStart).getTime()) ?? []
            const reactiveRowsForMonth = reactiveByMonthMs.get(monthStart.getTime()) ?? []
            resultByMonthMs.set(
                monthStart.getTime(),
                this.buildGroupAMonthResult(
                    kwhByPostMap,
                    contractedDemands,
                    demandRates,
                    rowsForMonth,
                    reactiveRowsForMonth,
                    tusdPerKvarh,
                    energyRates,
                    distributor,
                    flagPer100Kwh,
                    property.publicLightingFeeBrl,
                ),
            )
        }

        return resultByMonthMs
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
}
