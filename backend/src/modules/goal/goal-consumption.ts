import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { GoalUnit } from "@/generated/prisma/client.js"
import type { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"

/** Valor por mês de uma propriedade (kWh ou R$), indexado por ano e mês; mês sem dado fica fora. */
export class MonthlyValues {
    constructor(private readonly byYearMonth: ReadonlyMap<string, number>) {}

    /**
     * Os 12 meses de um ano, de janeiro a dezembro.
     *
     * @param year - Ano civil.
     * @returns O valor de cada mês, ou `null` onde não há dado (ausência, não zero).
     */
    forYear(year: number): (number | null)[] {
        return Array.from(
            { length: 12 },
            (_, month) => this.byYearMonth.get(`${year}-${month}`) ?? null,
        )
    }
}

const EMPTY = (): MonthlyValues => new MonthlyValues(new Map())

/**
 * O realizado mensal de uma propriedade na unidade da meta: consumo em kWh,
 * direto da agregação de leituras; custo em reais, do cálculo que o
 * `ConsumptionService` já faz por mês (grupo tarifário, bandeira, ACL, Tarifa
 * Branca), sem recalcular tarifa aqui; ou demanda em kW, do rollup de demanda
 * medida.
 */
export class GoalConsumptionReader {
    /**
     * @param meterRepository - Acha o medidor da propriedade (consumo em kWh).
     * @param consumptionRepository - Agregação mensal de leituras (consumo em kWh).
     * @param costSource - Custo mensal já calculado (R$).
     * @param demandRollups - Demanda medida por mês e posto (kW).
     */
    constructor(
        private readonly meterRepository: MeterRepository,
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly costSource: Pick<ConsumptionService, "list">,
        private readonly demandRollups: Pick<MeterDemandRollupRepository, "findByMeterAndPeriods">,
    ) {}

    /**
     * Realizado mensal do primeiro ano pedido até o fim do ano corrente.
     *
     * @param userId - Dono da propriedade (o cálculo de custo confere a posse).
     * @param propertyId - Propriedade; sem medidor ou sem custo calculável, o resultado é vazio.
     * @param firstYear - Primeiro ano da janela.
     * @param unit - Unidade da meta: kWh ou reais.
     * @param now - Instante de referência, para saber qual é o ano corrente.
     * @returns O valor por ano e mês, sem os meses sem dado.
     */
    async monthlyValues(
        userId: string,
        propertyId: string,
        firstYear: number,
        unit: GoalUnit,
        now: Date,
    ): Promise<MonthlyValues> {
        if (unit === "BRL") return this.monthlyCost(userId, propertyId, firstYear, now)
        if (unit === "KW") return this.monthlyDemand(propertyId, firstYear, now)
        return this.monthlyKwh(propertyId, firstYear, now)
    }

    private async monthlyKwh(
        propertyId: string,
        firstYear: number,
        now: Date,
    ): Promise<MonthlyValues> {
        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) return EMPTY()

        const currentYear = toSaoPauloLocal(now).getUTCFullYear()
        if (firstYear > currentYear) return EMPTY()

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
        return new MonthlyValues(
            new Map(
                items.map((bucket) => [
                    `${bucket.bucketStart.getUTCFullYear()}-${bucket.bucketStart.getUTCMonth()}`,
                    bucket.kwhConsumed,
                ]),
            ),
        )
    }

    // A demanda medida do mês é a maior potência média de 15 minutos entre os
    // postos, vinda do rollup incremental — nunca de uma varredura das leituras.
    // Mês sem janela medida não tem linha, e fica ausente em vez de virar 0 kW.
    private async monthlyDemand(
        propertyId: string,
        firstYear: number,
        now: Date,
    ): Promise<MonthlyValues> {
        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) return EMPTY()

        const local = toSaoPauloLocal(now)
        const currentYear = local.getUTCFullYear()
        if (firstYear > currentYear) return EMPTY()

        const periodStarts: Date[] = []
        for (let year = firstYear; year <= currentYear; year++) {
            const lastMonth = year === currentYear ? local.getUTCMonth() : 11
            for (let month = 0; month <= lastMonth; month++) {
                periodStarts.push(fromSaoPauloLocal(new Date(Date.UTC(year, month, 1))))
            }
        }

        const rows = await this.demandRollups.findByMeterAndPeriods(meter.id, periodStarts)
        const peakByMonth = new Map<string, number>()
        for (const row of rows) {
            const periodLocal = toSaoPauloLocal(row.periodStart)
            const key = `${periodLocal.getUTCFullYear()}-${periodLocal.getUTCMonth()}`
            peakByMonth.set(key, Math.max(peakByMonth.get(key) ?? 0, row.maxAvgPowerW / 1000))
        }
        return new MonthlyValues(peakByMonth)
    }

    // Um pedido por ano, em paralelo. No ano corrente a janela termina no fim do
    // mês corrente: o custo do Grupo A roda consultas por mês, e os meses que
    // ainda não aconteceram não têm o que calcular.
    private async monthlyCost(
        userId: string,
        propertyId: string,
        firstYear: number,
        now: Date,
    ): Promise<MonthlyValues> {
        const local = toSaoPauloLocal(now)
        const currentYear = local.getUTCFullYear()
        if (firstYear > currentYear) return EMPTY()

        const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i)
        const perYear = await Promise.all(
            years.map((year) =>
                this.yearCost(
                    userId,
                    propertyId,
                    year,
                    year === currentYear ? local.getUTCMonth() + 1 : 12,
                ),
            ),
        )
        return new MonthlyValues(new Map(perYear.flat()))
    }

    // Custo não calculável (sem medidor, Grupo A sem apuração, distribuidora sem
    // janela de ponta) é ausência, como no relatório mensal: o `list` o sinaliza
    // com `ValidationError` ou `NotFoundError`. Qualquer outro erro sobe.
    private async yearCost(
        userId: string,
        propertyId: string,
        year: number,
        monthsToRead: number,
    ): Promise<[string, number][]> {
        try {
            const result = await this.costSource.list(userId, {
                targetType: "PROPERTY",
                targetId: propertyId,
                granularity: "month",
                from: fromSaoPauloLocal(new Date(Date.UTC(year, 0, 1))),
                to: fromSaoPauloLocal(new Date(Date.UTC(year, monthsToRead, 1))),
                order: "asc",
                page: 1,
                pageSize: 12,
            })
            return result.items.flatMap((bucket): [string, number][] =>
                bucket.costBrl === undefined
                    ? []
                    : [
                          [
                              `${bucket.bucketStart.getUTCFullYear()}-${bucket.bucketStart.getUTCMonth()}`,
                              bucket.costBrl,
                          ],
                      ],
            )
        } catch (error) {
            if (error instanceof ValidationError || error instanceof NotFoundError) return []
            throw error
        }
    }
}
