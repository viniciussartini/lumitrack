import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"

/** kWh por mês de uma propriedade, indexado por ano e mês; mês sem leitura fica fora. */
export class MonthlyKwh {
    constructor(private readonly byYearMonth: ReadonlyMap<string, number>) {}

    /**
     * Os 12 meses de um ano, de janeiro a dezembro.
     *
     * @param year - Ano civil.
     * @returns O consumo de cada mês, ou `null` onde não há leitura (ausência, não zero).
     */
    forYear(year: number): (number | null)[] {
        return Array.from(
            { length: 12 },
            (_, month) => this.byYearMonth.get(`${year}-${month}`) ?? null,
        )
    }
}

/**
 * Consumo mensal (kWh) do medidor de uma propriedade, direto da agregação de
 * leituras — a mesma do `ConsumptionService`, sem o cálculo de custo, que as
 * metas não usam e que falha em tarifas ainda sem apuração.
 */
export class GoalConsumptionReader {
    /**
     * @param meterRepository - Acha o medidor da propriedade.
     * @param consumptionRepository - Agregação mensal de leituras.
     */
    constructor(
        private readonly meterRepository: MeterRepository,
        private readonly consumptionRepository: ConsumptionRepository,
    ) {}

    /**
     * Consumo mensal do primeiro ano pedido até o fim do ano corrente.
     *
     * @param propertyId - Propriedade; sem medidor, o resultado é vazio.
     * @param firstYear - Primeiro ano da janela.
     * @param now - Instante de referência, para saber qual é o ano corrente.
     * @returns O consumo por ano e mês, sem os meses sem leitura.
     */
    async monthlyKwh(propertyId: string, firstYear: number, now: Date): Promise<MonthlyKwh> {
        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) return new MonthlyKwh(new Map())

        const currentYear = toSaoPauloLocal(now).getUTCFullYear()
        if (firstYear > currentYear) return new MonthlyKwh(new Map())

        const { items } = await this.consumptionRepository.findAggregated({
            meterId: meter.id,
            granularity: "month",
            from: fromSaoPauloLocal(new Date(Date.UTC(firstYear, 0, 1))),
            to: fromSaoPauloLocal(new Date(Date.UTC(currentYear + 1, 0, 1))),
            order: "asc",
            skip: 0,
            take: (currentYear - firstYear + 1) * 12,
        })

        // `bucketStart` é a hora de parede de São Paulo lida como se fosse UTC.
        return new MonthlyKwh(
            new Map(
                items.map((bucket) => [
                    `${bucket.bucketStart.getUTCFullYear()}-${bucket.bucketStart.getUTCMonth()}`,
                    bucket.kwhConsumed,
                ]),
            ),
        )
    }
}
