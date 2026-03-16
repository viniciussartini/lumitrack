import { z } from "zod"
import { reportQuerySchema } from "@/modules/report/report.schema.js"
import type { ReportQuery, ReportResult, ReportTarget, ReportSummary, ReportTrend } from "@/modules/report/report.schema.js"
import type { ConsumptionRepository, ConsumptionResponse } from "@/modules/consumption/consumption.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// Threshold de 5% para classificar a tendência como INCREASING ou DECREASING.
// Variações menores que isso são consideradas ruído estatístico — STABLE.
const TREND_THRESHOLD = 0.05

export class ReportService {
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    // Ponto de entrada público

    async generate(
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<ReportResult> {
        const parsed = reportQuerySchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Parâmetros inválidos")
        }

        const query = parsed.data

        await this.validatePropertyOwnership(propertyId, userId)
        const consumptionTarget = await this.resolveAndValidateTarget(query, propertyId)

        const allRecords = await this.consumptionRepository.findAllByTarget(
            consumptionTarget,
            query.period,
        )

        const records = this.applyDateFilter(allRecords, query.dateFrom, query.dateTo)
        const summary = this.calculateSummary(records)
        const target = this.buildReportTarget(query, propertyId)

        return {
            generatedAt: new Date(),
            period: query.period,
            target,
            dateRange: query.dateFrom != null || query.dateTo != null
                ? { from: query.dateFrom ?? new Date(0), to: query.dateTo ?? new Date() }
                : null,
            summary,
            records,
        }
    }

    private async validatePropertyOwnership(propertyId: string, userId: string): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
    }

    // ─── Resolução e validação do target ─────────────────────────────────────
    // Converte o target tipado do query param para o formato que o
    // ConsumptionRepository entende, validando a hierarquia no caminho.

    private async resolveAndValidateTarget(
        query: ReportQuery,
        propertyId: string,
    ): Promise<{ propertyId: string } | { areaId: string } | { deviceId: string }> {
        if (query.target === "PROPERTY") {
            return { propertyId }
        }

        if (query.target === "AREA") {
            const areaId = query.targetId
            const area   = await this.areaRepository.findById(areaId)

            if (!area) {
                throw new NotFoundError("Área não encontrada")
            }

            if (area.propertyId !== propertyId) {
                throw new ForbiddenError("Área não pertence a esta propriedade")
            }

            return { areaId }
        }

        // DEVICE — valida area → property e device → area
        const deviceId = query.targetId
        const areaId   = query.targetAreaId

        const area = await this.areaRepository.findById(areaId)

        if (!area) {
            throw new NotFoundError("Área não encontrada")
        }

        if (area.propertyId !== propertyId) {
            throw new ForbiddenError("Área não pertence a esta propriedade")
        }

        const device = await this.deviceRepository.findById(deviceId)

        if (!device) {
            throw new NotFoundError("Dispositivo não encontrado")
        }

        if (device.areaId !== areaId) {
            throw new ForbiddenError("Dispositivo não pertence a esta área")
        }

        return { deviceId }
    }

    // Filtro de data
    // Aplicado em memória após buscar todos os registros do target+period.
    // O volume de registros de consumo por target é naturalmente pequeno
    // no máximo ~365 registros DAILY por ano

    private applyDateFilter(
        records: ConsumptionResponse[],
        dateFrom: Date | undefined,
        dateTo: Date | undefined,
    ): ConsumptionResponse[] {
        return records.filter((r) => {
            const ref = new Date(r.referenceDate)
            if (dateFrom && ref < dateFrom) return false
            if (dateTo   && ref > dateTo)   return false
            return true
        })
    }

    // Cálculo do summary

    private calculateSummary(records: ConsumptionResponse[]): ReportSummary {
        if (records.length === 0) {
            return {
                totalKwh: 0,
                totalCostBrl: 0,
                recordCount: 0,
                avgKwhPerRecord: 0,
                trend: "INSUFFICIENT_DATA",
            }
        }

        const totalKwh = records.reduce((sum, r) => sum + r.kwhConsumed, 0)
        const totalCostBrl = records.reduce((sum, r) => sum + (r.costBrl ?? 0), 0)

        return {
            totalKwh,
            totalCostBrl,
            recordCount: records.length,
            avgKwhPerRecord: totalKwh / records.length,
            trend: this.calculateTrend(records),
        }
    }

    // Cálculo de tendência
    // Divide os registros em duas metades cronológicas e compara a média de kWh.
    // Os registros chegam ordenados por referenceDate DESC do repositório,
    // então invertemos para processar em ordem cronológica ASC antes de dividir.
    //
    // Exemplo com 4 registros [Jan=100, Fev=100, Mar=120, Abr=120]:
    //   primeira metade: [Jan, Fev] → média 100
    //   segunda metade:  [Mar, Abr] → média 120
    //   variação = (120 - 100) / 100 = +20% → INCREASING
    //
    // Exemplo com 3 registros [Jan=100, Fev=120, Mar=130]:
    //   floor(3/2) = 1 → primeira metade: [Jan], segunda: [Fev, Mar]
    //   média primeira = 100, média segunda = 125
    //   variação = +25% → INCREASING

    private calculateTrend(records: ConsumptionResponse[]): ReportTrend {
        if (records.length < 2) {
            return "INSUFFICIENT_DATA"
        }

        // Inverte para ordem cronológica ASC (registros chegam DESC do repositório)
        const asc = [...records].sort(
            (a, b) => new Date(a.referenceDate).getTime() - new Date(b.referenceDate).getTime(),
        )
        const midpoint = Math.floor(asc.length / 2)
        const firstHalf = asc.slice(0, midpoint)
        const secondHalf = asc.slice(midpoint)

        const avgFirst = firstHalf.reduce((s, r) => s + r.kwhConsumed, 0)  / firstHalf.length
        const avgSecond = secondHalf.reduce((s, r) => s + r.kwhConsumed, 0) / secondHalf.length

        // Variação relativa: quanto a segunda metade mudou em relação à primeira
        const change = (avgSecond - avgFirst) / avgFirst

        if (change > TREND_THRESHOLD)  {
            return "INCREASING"
        }

        if (change < -TREND_THRESHOLD) {
            return "DECREASING"
        }

        return "STABLE"
    }

    // Montagem do ReportTarget tipado
    // Constrói o objeto target do output com todos os IDs relevantes,
    // para que o front-end saiba exatamente qual entidade foi reportada.

    private buildReportTarget(
        query: ReportQuery,
        propertyId: string,
    ): ReportTarget {
        if (query.target === "AREA") {
            return { type: "AREA", propertyId, areaId: query.targetId }
        }

        if (query.target === "DEVICE") {
            return { type: "DEVICE", propertyId, areaId: query.targetAreaId, deviceId: query.targetId }
        }

        return { type: "PROPERTY", propertyId }
    }
}