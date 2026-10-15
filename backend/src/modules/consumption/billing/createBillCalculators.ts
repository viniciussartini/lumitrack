import type { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { BucketCostCalculator } from "@/modules/consumption/billing/BucketCostCalculator.js"
import { GroupABillCalculator } from "@/modules/consumption/billing/GroupABillCalculator.js"
import { GroupBWhiteBillCalculator } from "@/modules/consumption/billing/GroupBWhiteBillCalculator.js"
import { PropertyMonthCostCalculator } from "@/modules/consumption/billing/PropertyMonthCostCalculator.js"
import { YearlyPropertyCostCalculator } from "@/modules/consumption/billing/YearlyPropertyCostCalculator.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import type { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { TariffService } from "@/shared/tariff/tariff.service.js"

/** As calculadoras de conta que o `ConsumptionService` usa, ligadas entre si. */
export type BillCalculators = {
    groupA: GroupABillCalculator
    groupBWhite: GroupBWhiteBillCalculator
    monthCost: PropertyMonthCostCalculator
    yearlyCost: YearlyPropertyCostCalculator
    bucketCost: BucketCostCalculator
}

/**
 * Liga as calculadoras de conta (Grupo A, Tarifa Branca, mês e ano) com os
 * mesmos repositórios e o mesmo `TariffService`.
 *
 * @param consumptionRepository - Consumo por posto, energia reativa e consumo mensal.
 * @param tariffCatalogRepository - Tarifas de energia e de demanda.
 * @param meterDemandRollupRepository - Demanda medida por posto e mês.
 * @param aclContractRepository - Contratos de energia do Mercado Livre.
 * @param tariffService - Fórmulas da conta.
 * @returns As calculadoras prontas para uso.
 */
export function createBillCalculators(
    consumptionRepository: ConsumptionRepository,
    tariffCatalogRepository: TariffCatalogRepository,
    meterDemandRollupRepository: MeterDemandRollupRepository,
    aclContractRepository: AclContractRepository,
    tariffService: TariffService,
): BillCalculators {
    const groupA = new GroupABillCalculator(
        consumptionRepository,
        tariffCatalogRepository,
        meterDemandRollupRepository,
        aclContractRepository,
        tariffService,
    )
    const groupBWhite = new GroupBWhiteBillCalculator(
        consumptionRepository,
        tariffCatalogRepository,
        tariffService,
    )
    const monthCost = new PropertyMonthCostCalculator(groupA, groupBWhite, tariffService)
    const yearlyCost = new YearlyPropertyCostCalculator(
        consumptionRepository,
        groupA,
        groupBWhite,
        monthCost,
    )
    const bucketCost = new BucketCostCalculator(groupA, groupBWhite, monthCost, tariffService)
    return { groupA, groupBWhite, monthCost, yearlyCost, bucketCost }
}
