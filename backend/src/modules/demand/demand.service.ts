import type { TariffPost } from "@/generated/prisma/client.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { demandOverviewQuerySchema } from "@/modules/demand/demand.schema.js"
import {
    contractedKwForPost,
    resolveMonthMax,
    worstExceedancePercent,
    type MonthMax,
} from "@/modules/demand/demand-overview.js"
import type { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import {
    resolveContractedDemands,
    type ContractedDemand,
} from "@/shared/tariff/contractedDemand.js"
import {
    computeDemandDayPoints,
    computeTrailingWindowAverage,
} from "@/shared/tariff/demandRollup.js"
import { classifyPost, type PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidays } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const WINDOW_MINUTES = 15

export type DemandOverviewPoint = {
    /** Minuto em que a janela de 15 minutos termina. */
    windowEnd: Date
    /** Demanda da janela, em kW; `null` se ainda não fechou ou está incompleta. */
    kw: number | null
    /** Posto da janela; `null` quando a distribuidora não tem janela de ponta (só Verde). */
    post: TariffPost | null
    /** Demanda contratada que vale para a janela: a do posto dela. */
    contractedKw: number
}

export type DemandOverviewResponse = {
    propertyId: string
    modality: "GREEN" | "BLUE"
    windowMinutes: number
    contracted: { post: TariffPost | null; kw: number }[]
    /** Janela de 15 minutos que termina no último minuto fechado. */
    current: { kw: number | null; windowEnd: Date }
    /** Maior demanda do mês entre os postos. */
    monthMax: MonthMax
    /** Pior estouro sobre a contratada, em %; 0 sem estouro; `null` sem janela medida. */
    exceedancePercent: number | null
    day: { date: string; points: DemandOverviewPoint[] }
}

type PeriodBounds = {
    /** Último minuto já fechado (o anterior ao corrente), como o rollup de demanda. */
    lastClosedMinute: Date
    /** Instante UTC real da meia-noite local de hoje. */
    dayStart: Date
    /** Instante UTC real da meia-noite local do dia 1º do mês corrente. */
    monthStart: Date
    /** Hoje em hora local, "YYYY-MM-DD". */
    date: string
}

function periodBounds(now: Date): PeriodBounds {
    const local = toSaoPauloLocal(now)
    const year = local.getUTCFullYear()
    return {
        lastClosedMinute: new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS - MINUTE_MS),
        dayStart: fromSaoPauloLocal(
            new Date(Date.UTC(year, local.getUTCMonth(), local.getUTCDate())),
        ),
        monthStart: fromSaoPauloLocal(new Date(Date.UTC(year, local.getUTCMonth(), 1))),
        date: local.toISOString().slice(0, 10),
    }
}

// Cada janela leva o posto do seu minuto final e a contratada desse posto; sem
// janela de ponta (só a Verde chega aqui) o posto fica indefinido.
function buildDayPoints(
    readings: { minuteStart: Date; avgPowerW: number; secondsCovered: number }[],
    bounds: PeriodBounds,
    contracted: ContractedDemand[],
    peakWindow: PeakWindowConfig | null,
): DemandOverviewPoint[] {
    const holidays = getNationalHolidays(Number(bounds.date.slice(0, 4)))
    return computeDemandDayPoints(readings, bounds.dayStart, bounds.lastClosedMinute).map(
        (point) => {
            const post = peakWindow
                ? classifyPost(toSaoPauloLocal(point.windowEnd), peakWindow, holidays)
                : null
            return {
                windowEnd: point.windowEnd,
                kw: point.avgPowerW === null ? null : point.avgPowerW / 1000,
                post,
                contractedKw: contractedKwForPost(contracted, post),
            }
        },
    )
}

/**
 * Demanda atual × contratada de uma propriedade do Grupo A, para o Painel. A
 * máxima do mês e a ultrapassagem vêm do rollup mensal; a demanda atual e a
 * curva do dia vêm das leituras por minuto, com a mesma regra de janela do
 * rollup (15 leituras consecutivas; buraco é ausência, nunca 0 kW).
 */
export class DemandOverviewService {
    /**
     * @param propertyRepository - Confere a existência e o dono da propriedade.
     * @param meterRepository - Medidor da propriedade.
     * @param distributorRepository - Janela de ponta, que classifica o posto de cada janela.
     * @param meterReadingRepository - Leituras por minuto do dia e janela mais recente.
     * @param demandRollupRepository - Máxima de demanda do mês por posto.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly meterRepository: MeterRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly meterReadingRepository: MeterReadingRepository,
        private readonly demandRollupRepository: MeterDemandRollupRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Visão de demanda de uma propriedade do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta (`propertyId`), validada aqui.
     * @returns Demanda atual, máxima do mês, ultrapassagem e a curva do dia.
     */
    async overview(userId: string, query: unknown): Promise<DemandOverviewResponse> {
        const { propertyId } = parseOrThrow(demandOverviewQuerySchema, query)
        const property = await this.getSupportedProperty(userId, propertyId)
        const modality = property.tariffModality as "GREEN" | "BLUE"
        const contracted = resolveContractedDemands(property, modality)

        const meter = await this.meterRepository.findByTarget("PROPERTY", propertyId)
        if (!meter) throw new NotFoundError("Esta propriedade não possui medidor vinculado")
        const peakWindow = await this.resolvePeakWindow(property, modality)

        const bounds = periodBounds(this.now())

        const [rollups, trailing, dayReadings] = await Promise.all([
            this.demandRollupRepository.findByMeterAndPeriod(meter.id, bounds.monthStart),
            this.meterReadingRepository.findTrailingReadings(
                meter.id,
                bounds.lastClosedMinute,
                WINDOW_MINUTES,
            ),
            this.meterReadingRepository.findMinuteReadings(
                meter.id,
                bounds.dayStart,
                new Date(bounds.dayStart.getTime() + DAY_MS),
            ),
        ])

        const currentW = computeTrailingWindowAverage(trailing, bounds.lastClosedMinute)
        const points = buildDayPoints(dayReadings, bounds, contracted, peakWindow)

        return {
            propertyId,
            modality,
            windowMinutes: WINDOW_MINUTES,
            contracted: contracted.map((demand) => ({
                post: demand.post,
                kw: demand.contractedDemandKw,
            })),
            current: {
                kw: currentW === null ? null : currentW / 1000,
                windowEnd: bounds.lastClosedMinute,
            },
            monthMax: resolveMonthMax(rollups),
            exceedancePercent: worstExceedancePercent(contracted, rollups),
            day: { date: bounds.date, points },
        }
    }

    // Existência, posse (A01), Grupo A e modalidade com cálculo implementado:
    // nega por padrão, com as mesmas mensagens do custo e do alerta de demanda.
    private async getSupportedProperty(
        userId: string,
        propertyId: string,
    ): Promise<PropertyResponse> {
        const property = await this.propertyRepository.findById(propertyId)
        if (!property) throw new NotFoundError("Propriedade não encontrada")
        if (property.userId !== userId) throw new ForbiddenError("Acesso negado")
        if (property.tariffGroup !== "GROUP_A") {
            throw new ValidationError("A demanda contratada só se aplica a propriedades do Grupo A")
        }
        if (property.tariffModality !== "GREEN" && property.tariffModality !== "BLUE") {
            throw new ValidationError(
                "Cálculo de conta do Grupo A ainda não suportado para esta modalidade tarifária",
            )
        }
        return property
    }

    // Sem janela de ponta a Azul não tem como saber qual contratada vale em cada
    // janela e falha fechada, sem adivinhar 18h-21h; a Verde, que tem uma
    // demanda só, segue sem classificar o posto.
    private async resolvePeakWindow(
        property: PropertyResponse,
        modality: "GREEN" | "BLUE",
    ): Promise<PeakWindowConfig | null> {
        const distributor = await this.distributorRepository.findById(property.distributorId)
        if (!distributor) throw new NotFoundError("Distribuidora vinculada não encontrada")

        const { peakWindowStartHour, peakWindowEndHour } = distributor
        if (peakWindowStartHour !== null && peakWindowEndHour !== null) {
            return { peakWindowStartHour, peakWindowEndHour }
        }
        if (modality === "BLUE") {
            throw new ValidationError("Distribuidora sem janela de ponta configurada")
        }
        return null
    }
}
