import type { MonthCostResult } from "@/modules/consumption/billing/billing.types.js"
import type { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import type { GroupBWhiteBillCalculator } from "@/modules/consumption/billing/GroupBWhiteBillCalculator.js"
import type { PropertyMonthCostCalculator } from "@/modules/consumption/billing/PropertyMonthCostCalculator.js"
import type { ConsumptionBucket } from "@/modules/consumption/consumption.repository.js"
import type { Granularity } from "@/modules/consumption/consumption.schema.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { PropertyWithoutAddress } from "@/modules/property/property.repository.js"
import type { TariffService } from "@/shared/tariff/tariff.service.js"
import type { TargetType } from "@/generated/prisma/client.js"

/**
 * Custo de um bucket de consumo, para quem lista ou resume: escolhe o cálculo
 * pela granularidade e pelo alvo (mês de Propriedade pela calculadora do grupo
 * tarifário, o resto como energia + bandeira + tributos). `null` é o custo não
 * calculável, nunca zero.
 */
export class BucketCostCalculator {
    /**
     * @param groupA - Calculadora do Grupo A.
     * @param groupBWhite - Calculadora da Tarifa Branca.
     * @param monthCost - Calculadora do mês de uma Propriedade.
     * @param tariffService - Aplica a fórmula de energia + bandeira + tributos.
     */
    constructor(
        private readonly groupA: GroupABillCalculator,
        private readonly groupBWhite: GroupBWhiteBillCalculator,
        private readonly monthCost: PropertyMonthCostCalculator,
        private readonly tariffService: TariffService,
    ) {}

    /**
     * Custo mensal de uma Propriedade do Grupo A ou da Tarifa Branca para todos
     * os meses da página de `list()`, numa só rodada: cada mês custa várias
     * queries (consumo por posto, demanda, reativa) e eram disparados todos em
     * paralelo, um por balde. O Grupo B Convencional é conta pura, sem query, e
     * segue por {@link calculateBucketCost}.
     *
     * @param meterId - Medidor da propriedade.
     * @param buckets - Buckets da página.
     * @param granularity - Granularidade pedida; só "month" calcula.
     * @param targetType - Tipo do alvo; só PROPERTY calcula.
     * @param property - Propriedade.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo de cada mês por instante do bucket em ms; vazio fora de month + PROPERTY do Grupo A ou da Branca.
     */
    async computeMonthlyPropertyCosts(
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
            return this.groupA.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
                property.contractingEnvironment,
            )
        }

        if (property.groupBModality === "WHITE") {
            return this.groupBWhite.calculateMonthlyCosts(
                meterId,
                monthStarts,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        return new Map()
    }

    /**
     * Custo de um bucket dentro de `list()`: year + PROPERTY usa o pré-cálculo
     * anual (o piso mensal já foi somado lá), month + PROPERTY do Grupo A ou da
     * Branca usa o lote mensal, e os demais casos delegam a
     * {@link calculateBucketCost}, compartilhado com `summary()`.
     *
     * @param meterId - Medidor do alvo.
     * @param bucket - Bucket a precificar.
     * @param granularity - Granularidade pedida.
     * @param targetType - Tipo do alvo.
     * @param property - Propriedade raiz do alvo.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @param yearlyPropertyCostByBucketMs - Custos anuais já calculados, por bucket.
     * @param monthlyPropertyCostByBucketMs - Custos mensais já calculados em lote, por bucket.
     * @returns O custo do bucket, ou `null` quando não é calculável para o alvo e a tarifa.
     */
    async resolveBucketCost(
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

    /**
     * Custo de um bucket que NÃO é year + PROPERTY (esse caso exige a soma de
     * 12 meses com piso próprio cada, tratado à parte por cada chamador: `list()`
     * soma a página inteira de uma vez, `summary()` só tem 1 bucket por alvo).
     *
     * @param meterId - Medidor do alvo.
     * @param bucket - Bucket a precificar.
     * @param granularity - Granularidade pedida.
     * @param targetType - Tipo do alvo.
     * @param property - Propriedade raiz do alvo.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo do bucket, ou `null` quando não é calculável para o alvo e a tarifa.
     */
    async calculateBucketCost(
        meterId: string,
        bucket: { bucketStart: Date; kwhConsumed: number },
        granularity: Granularity,
        targetType: TargetType,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult | null> {
        if (granularity === "month" && targetType === "PROPERTY") {
            return this.monthCost.calculate(
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
}
