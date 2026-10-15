import type { MonthCostResult } from "@/modules/consumption/billing/billing.types.js"
import { resolveMonthWindow } from "@/modules/consumption/billing/monthWindow.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type {
    TariffCatalogRepository,
    TariffEnergyRateResponse,
} from "@/modules/distributor/tariff-catalog.repository.js"
import type { PropertyWithoutAddress } from "@/modules/property/property.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import type { GroupBEnergyPostInput, TariffService } from "@/shared/tariff/tariff.service.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidaysInRange } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"
import type { TariffPost } from "@/generated/prisma/client.js"

/**
 * Calculadora da conta da Tarifa Branca (Grupo B): consumo por posto
 * (Ponta, Intermediário e Fora de Ponta) × tarifa do catálogo da distribuidora.
 */
export class GroupBWhiteBillCalculator {
    /**
     * @param consumptionRepository - Resolve o consumo por posto de um ou de vários meses.
     * @param tariffCatalogRepository - Resolve as tarifas de energia por posto da Branca.
     * @param tariffService - Aplica a fórmula da conta.
     */
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly tariffCatalogRepository: TariffCatalogRepository,
        private readonly tariffService: TariffService,
    ) {}

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
    // `calculateMonth` para o batching de vários meses
    // (`calculateMonthlyCosts`) reaproveitar a mesma tradução
    // para `MonthCostResult`, mesmo padrão de `buildGroupAMonthResult`.
    private buildGroupBWhiteMonthResult(
        energyByPost: GroupBEnergyPostInput[],
        property: PropertyWithoutAddress,
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

    /**
     * Conta da Tarifa Branca (Grupo B) de 1 mês: consumo por posto × tarifa do
     * catálogo da modalidade. O piso de disponibilidade não é decidido aqui:
     * `TariffService.calculateForGroupBWhite` decide se o mês cai nele (piso
     * cobrado pela Convencional).
     *
     * @param meterId - Medidor da propriedade.
     * @param monthStartLocal - Início do mês, na convenção "hora local nos getters UTC".
     * @param property - Propriedade na Tarifa Branca.
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

    /**
     * Equivalente de {@link GroupABillCalculator.calculateMonthlyCosts} para a
     * Branca: 1 única consulta de consumo por posto para todos os meses da
     * janela, em vez de 1 por mês.
     *
     * @param meterId - Medidor da propriedade.
     * @param monthStarts - Inícios dos meses, na convenção "hora local nos getters UTC".
     * @param property - Propriedade na Tarifa Branca.
     * @param distributor - Distribuidora (tributos, janela de ponta e catálogo).
     * @param flagPer100Kwh - Bandeira tarifária vigente, em R$ por 100 kWh.
     * @returns O custo e a decomposição de cada mês, por instante do mês em ms.
     */
    async calculateMonthlyCosts(
        meterId: string,
        monthStarts: Date[],
        property: PropertyWithoutAddress,
        distributor: DistributorResponse,
        flagPer100Kwh: number,
    ): Promise<Map<number, MonthCostResult>> {
        const resultByMonthMs = new Map<number, MonthCostResult>()
        if (monthStarts.length === 0) return resultByMonthMs

        const peakWindow = this.assertGroupBWhitePeakWindow(distributor)
        const { from, to, holidays } = resolveMonthWindow(monthStarts)

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
}
