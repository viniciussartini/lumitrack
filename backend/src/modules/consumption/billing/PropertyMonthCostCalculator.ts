import type { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import type { GroupBWhiteBillCalculator } from "@/modules/consumption/billing/GroupBWhiteBillCalculator.js"
import type { MonthCostResult } from "@/modules/consumption/billing/billing.types.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { PropertyWithoutAddress } from "@/modules/property/property.repository.js"
import type { TariffService } from "@/shared/tariff/tariff.service.js"

/**
 * Despacha o custo de um mês de uma Propriedade para a calculadora do seu
 * grupo tarifário: Grupo A, Tarifa Branca ou Grupo B Convencional.
 */
export class PropertyMonthCostCalculator {
    /**
     * @param groupA - Calculadora do Grupo A.
     * @param groupBWhite - Calculadora da Tarifa Branca.
     * @param tariffService - Aplica o monômio do Grupo B Convencional.
     */
    constructor(
        private readonly groupA: GroupABillCalculator,
        private readonly groupBWhite: GroupBWhiteBillCalculator,
        private readonly tariffService: TariffService,
    ) {}

    /**
     * Custo de um único mês de uma Propriedade (a unidade que sustenta o
     * piso/CIP), compartilhado entre o lote da página de `list()` e o cálculo
     * por alvo de `summary()`. Ramifica por grupo tarifário/modalidade em vez
     * de generalizar: Grupo B Convencional usa o monômio de sempre (piso +
     * tarifa plana da distribuidora); Branca e Grupo A precisam do consumo por
     * posto (e, no Grupo A, da demanda contratada), então delegam às suas
     * calculadoras, que fazem as próprias consultas — `kwhConsumed` aqui é um
     * total do mês, não quebrado por posto.
     *
     * @param meterId - Medidor da propriedade.
     * @param monthStartLocal - Início do mês, na convenção "hora local nos getters UTC".
     * @param kwhConsumed - Consumo total do mês (usado só pela Convencional).
     * @param property - Propriedade.
     * @param distributor - Distribuidora.
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo do mês, com a decomposição quando houver.
     */
    async calculate(
        meterId: string,
        monthStartLocal: Date,
        kwhConsumed: number,
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<MonthCostResult> {
        if (property.tariffGroup === "GROUP_A") {
            return this.groupA.calculateMonth(
                meterId,
                monthStartLocal,
                property,
                distributor,
                flagPer100Kwh,
            )
        }

        if (property.groupBModality === "WHITE") {
            return this.groupBWhite.calculateMonth(
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
}
