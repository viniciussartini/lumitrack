import type { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import type { GroupBWhiteBillCalculator } from "@/modules/consumption/billing/GroupBWhiteBillCalculator.js"
import type { PropertyMonthCostCalculator } from "@/modules/consumption/billing/PropertyMonthCostCalculator.js"
import type { MonthCostResult } from "@/modules/consumption/billing/billing.types.js"
import type {
    ConsumptionBucket,
    ConsumptionRepository,
    MonthlyKwhForYear,
} from "@/modules/consumption/consumption.repository.js"
import type { Granularity } from "@/modules/consumption/consumption.schema.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { PropertyWithoutAddress } from "@/modules/property/property.repository.js"
import type { TargetType } from "@/generated/prisma/client.js"

/**
 * Calculadora do custo anual de uma Propriedade: soma os custos mensais do
 * ano, cada um pela calculadora do grupo tarifário.
 */
export class YearlyPropertyCostCalculator {
    /**
     * @param consumptionRepository - Resolve o consumo mensal dos anos pedidos.
     * @param groupA - Calculadora do Grupo A.
     * @param groupBWhite - Calculadora da Tarifa Branca.
     * @param monthCost - Calculadora do mês, para o Grupo B Convencional.
     */
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly groupA: GroupABillCalculator,
        private readonly groupBWhite: GroupBWhiteBillCalculator,
        private readonly monthCost: PropertyMonthCostCalculator,
    ) {}

    // Soma o custo de cada mês (já resolvido em lote pelas calculadoras do
    // Grupo A e da Branca) no bucket de ano correspondente: os dois caminhos
    // fazem exatamente essa soma, só a origem do Map de custo mensal muda.
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

    /**
     * Custo anual de uma Propriedade, para a página inteira de buckets de ano
     * de `list()`. O piso de disponibilidade é mensal, então o custo anual
     * correto é a soma de 12 custos mensais (cada um com o próprio piso/CIP),
     * nunca o piso aplicado uma vez sobre o total do ano; uma única consulta
     * traz os meses de todos os anos da página, e Grupo A e Branca calculam
     * todos os meses em lote.
     *
     * @param meterId - Medidor da propriedade.
     * @param buckets - Buckets de ano da página.
     * @param granularity - Granularidade pedida; só "year" calcula.
     * @param targetType - Tipo do alvo; só PROPERTY calcula.
     * @param property - Propriedade.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo de cada ano, por instante do bucket em ms; vazio fora de year + PROPERTY.
     */
    async computeForBuckets(
        meterId: string,
        buckets: ConsumptionBucket[],
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyWithoutAddress,
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
            const monthlyCostByMonthMs = await this.groupA.calculateMonthlyCosts(
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
            const monthlyCostByMonthMs = await this.groupBWhite.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
            )
            return this.sumMonthlyCostsIntoYearlyBuckets(monthlyRows, monthlyCostByMonthMs)
        }

        for (const row of monthlyRows) {
            const monthCost = await this.monthCost.calculate(
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

    /**
     * Custo anual do bucket de ano de uma Propriedade, para quem tem 1 bucket
     * por alvo (o resumo): o mesmo cálculo de {@link computeForBuckets}, com
     * uma consulta para os até 12 meses do ano em vez de uma por mês.
     *
     * @param meterId - Medidor da propriedade.
     * @param yearBucketStart - Início do ano, na convenção "hora local nos getters UTC".
     * @param property - Propriedade.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo do ano.
     */
    async computeForYear(
        meterId: string,
        yearBucketStart: Date,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<number> {
        const monthlyRows = await this.consumptionRepository.findMonthlyKwhForYears(meterId, [
            yearBucketStart,
        ])

        // Mesmo batching de computeForBuckets: 1 consulta para os
        // até 12 meses do ano, em vez de 1 findKwhByPost por mês — aqui
        // importa ainda mais, porque summary() chama isto por ALVO da lista
        // comparada (N alvos × até 12 meses, sem o batch).
        if (property.tariffGroup === "GROUP_A") {
            const monthlyCostByMonthMs = await this.groupA.calculateMonthlyCosts(
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
            const monthlyCostByMonthMs = await this.groupBWhite.calculateMonthlyCosts(
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
            const monthCost = await this.monthCost.calculate(
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
