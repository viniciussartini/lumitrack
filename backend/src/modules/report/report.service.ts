import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { ReportRepository, ReportResponse } from "@/modules/report/report.repository.js"
import {
    createReportSchema,
    monthToPeriod,
    reportIdParamsSchema,
    resolveReportPeriod,
    type CreateReportInput,
} from "@/modules/report/report.schema.js"
import type {
    ReportChildRow,
    ReportData,
    ReportKpis,
    ReportMonthlyExtras,
} from "@/modules/report/report.types.js"
import { generateReportCsv } from "@/modules/report/generators/reportCsv.js"
import { generateReportPdf } from "@/modules/report/generators/reportPdf.js"
import { buildReportFileName } from "@/modules/report/generators/format.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

const DAY_MS = 24 * 60 * 60 * 1000

// Teto do arquivo gerado — o conteúdo mora no banco (ADR-0023), então um
// relatório fora do esperado precisa falhar em vez de inflar a tabela.
export const MAX_REPORT_BYTES = 5 * 1024 * 1024

// Um período de até 92 dias tem no máximo 93 baldes diários (contando o
// balde parcial de uma janela que não começa à meia-noite local).
const MAX_DAILY_BUCKETS = 100

const CONTENT_TYPES = { PDF: "application/pdf", CSV: "text/csv; charset=utf-8" } as const

type TargetKind = ReportData["target"]["kind"]

const TARGET_KIND_BY_TYPE: Record<CreateReportInput["targetType"], TargetKind> = {
    PROPERTY: "Propriedade",
    AREA: "Área",
    DEVICE: "Dispositivo",
}

function round(value: number, fractionDigits: number): number {
    const factor = 10 ** fractionDigits
    return Math.round(value * factor) / factor
}

function describeTariff(property: PropertyResponse): string {
    if (property.tariffGroup === "GROUP_A") {
        return property.tariffSubgroup ? `Grupo A · ${property.tariffSubgroup}` : "Grupo A"
    }
    return property.billingClass ? `Grupo B · ${property.billingClass}` : "Grupo B"
}

/**
 * Mês anterior a um mês no formato "AAAA-MM".
 *
 * @param month - Mês de referência, já validado pelo schema.
 * @returns O mês anterior, também em "AAAA-MM".
 */
function previousMonth(month: string): string {
    const [year, monthNumber] = month.split("-").map(Number) as [number, number]
    const date = new Date(Date.UTC(year, monthNumber - 2, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Arquivo pronto para download. */
export interface ReportDownload {
    fileName: string
    contentType: string
    content: Buffer
}

/**
 * Emissão de relatórios sob demanda: resolve o alvo (com checagem de posse),
 * agrega os dados, gera o arquivo e o grava como imutável.
 */
export class ReportService {
    /**
     * @param reportRepository - Persistência dos relatórios emitidos.
     * @param consumptionRepository - Leituras agregadas por dia e totais por medidor.
     * @param consumptionService - Fonte do custo mensal, que já resolve grupo tarifário e ACL.
     * @param meterRepository - Resolve o medidor vinculado a um alvo.
     * @param propertyRepository - Usado por {@link resolveRootProperty} para resolver a posse.
     * @param areaRepository - Usado por {@link resolveRootProperty} e para listar as áreas de uma propriedade.
     * @param deviceRepository - Usado por {@link resolveRootProperty} e para listar os dispositivos de uma área.
     * @param distributorRepository - Nome da distribuidora da propriedade.
     * @param now - Relógio injetável, para os testes fixarem "hoje".
     */
    constructor(
        private readonly reportRepository: ReportRepository,
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly consumptionService: Pick<ConsumptionService, "list">,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Emite um relatório e o grava.
     *
     * @param userId - Id do usuário autenticado (dono do alvo).
     * @param body - Corpo bruto do pedido, validado aqui.
     * @returns Os metadados do relatório emitido; o arquivo sai por {@link getFile}.
     */
    async generate(userId: string, body: unknown): Promise<ReportResponse> {
        const input = parseOrThrow(createReportSchema, body)
        const period = resolveReportPeriod(input)
        const { property, meterId } = await this.resolveOwnedTarget(userId, input)

        const data = await this.buildReportData(userId, input, period, property, meterId)
        const content =
            input.format === "PDF" ? await generateReportPdf(data) : generateReportCsv(data)
        if (content.length > MAX_REPORT_BYTES) {
            throw new ValidationError("O relatório gerado excede o tamanho máximo permitido")
        }

        return this.reportRepository.create({
            userId,
            targetType: input.targetType,
            targetId: input.targetId,
            type: input.type,
            format: input.format,
            origin: "MANUAL",
            periodStart: period.from,
            periodEnd: period.to,
            fileName: buildReportFileName(
                input.type,
                period,
                input.format === "PDF" ? "pdf" : "csv",
            ),
            content,
        })
    }

    /**
     * Arquivo de um relatório do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param params - Parâmetros de rota brutos (`id`), validados aqui.
     * @returns O nome, o tipo de conteúdo e os bytes do arquivo.
     * @throws {NotFoundError} Relatório inexistente ou de outro usuário — os dois casos são indistinguíveis de propósito.
     */
    async getFile(userId: string, params: unknown): Promise<ReportDownload> {
        const { id } = parseOrThrow(reportIdParamsSchema, params)
        const file = await this.reportRepository.findFileByIdAndUser(id, userId)
        if (!file) throw new NotFoundError("Relatório não encontrado")
        return {
            fileName: file.fileName,
            contentType: CONTENT_TYPES[file.format],
            content: file.content,
        }
    }

    // Posse e medidor do alvo — toda falha aqui é fechada: alvo alheio é 403,
    // alvo sem medidor é 404.
    private async resolveOwnedTarget(
        userId: string,
        input: CreateReportInput,
    ): Promise<{ property: PropertyResponse; meterId: string }> {
        const property = await resolveRootProperty(input.targetType, input.targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(input.targetType, input.targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }
        return { property, meterId: meter.id }
    }

    private async buildReportData(
        userId: string,
        input: CreateReportInput,
        period: { from: Date; to: Date },
        property: PropertyResponse,
        meterId: string,
    ): Promise<ReportData> {
        const [distributor, targetName, daily] = await Promise.all([
            this.distributorRepository.findById(property.distributorId),
            this.resolveTargetName(input, property),
            this.consumptionRepository.findAggregated({
                meterId,
                granularity: "day",
                from: period.from,
                to: period.to,
                order: "asc",
                skip: 0,
                take: MAX_DAILY_BUCKETS,
            }),
        ])

        const generatedAt = this.now()
        const kpis = this.buildKpis(daily.items, period, generatedAt)

        return {
            type: input.type,
            generatedAt,
            target: { kind: TARGET_KIND_BY_TYPE[input.targetType], name: targetName },
            property: {
                name: property.name,
                distributorName: distributor?.name ?? null,
                tariffLabel: describeTariff(property),
            },
            period,
            kpis,
            daily: daily.items.map((row) => ({
                day: row.bucketStart,
                kwhConsumed: round(row.kwhConsumed, 3),
                avgPowerW: round(row.avgPowerW, 1),
            })),
            children: await this.buildChildren(input, period, kpis.totalKwh),
            monthly:
                input.type === "MONTHLY"
                    ? await this.buildMonthlyExtras(userId, input, meterId, kpis.totalKwh)
                    : null,
        }
    }

    /**
     * Nome do alvo pedido — o da propriedade já vem resolvido; área e
     * dispositivo precisam de uma leitura própria.
     *
     * @param input - Pedido validado.
     * @param property - Propriedade raiz do alvo.
     * @returns O nome a exibir no arquivo.
     */
    private async resolveTargetName(
        input: CreateReportInput,
        property: PropertyResponse,
    ): Promise<string> {
        if (input.targetType === "PROPERTY") return property.name
        const target =
            input.targetType === "AREA"
                ? await this.areaRepository.findById(input.targetId)
                : await this.deviceRepository.findById(input.targetId)
        if (!target) throw new NotFoundError("Alvo não encontrado")
        return target.name
    }

    // Média sobre os dias já transcorridos: num mês em curso, dividir pelo mês
    // inteiro subestimaria a média diária.
    private buildKpis(
        daily: { bucketStart: Date; kwhConsumed: number }[],
        period: { from: Date; to: Date },
        now: Date,
    ): ReportKpis {
        const totalKwh = daily.reduce((sum, row) => sum + row.kwhConsumed, 0)
        const elapsedMs = Math.min(period.to.getTime(), now.getTime()) - period.from.getTime()
        const elapsedDays = Math.max(0, Math.ceil(elapsedMs / DAY_MS))

        const peak = daily.reduce<{ bucketStart: Date; kwhConsumed: number } | null>(
            (best, row) => (best === null || row.kwhConsumed > best.kwhConsumed ? row : best),
            null,
        )

        return {
            totalKwh: round(totalKwh, 3),
            averageDailyKwh: elapsedDays > 0 ? round(totalKwh / elapsedDays, 3) : 0,
            peakDay: peak
                ? { day: peak.bucketStart, kwhConsumed: round(peak.kwhConsumed, 3) }
                : null,
        }
    }

    // Filhos do alvo: áreas de uma propriedade, dispositivos de uma área.
    // Dispositivo é folha — não tem quebra.
    private async buildChildren(
        input: CreateReportInput,
        period: { from: Date; to: Date },
        parentTotalKwh: number,
    ): Promise<ReportData["children"]> {
        if (input.targetType === "DEVICE") return null

        const isProperty = input.targetType === "PROPERTY"
        const children = isProperty
            ? await this.areaRepository.findAllByProperty(input.targetId)
            : await this.deviceRepository.findAllByArea(input.targetId)
        const childTarget = isProperty ? "AREA" : "DEVICE"

        const meters = await Promise.all(
            children.map((child) => this.meterRepository.findByTarget(childTarget, child.id)),
        )
        const meterIds = meters.flatMap((meter) => (meter ? [meter.id] : []))
        const totals = await this.consumptionRepository.findKwhTotalsByMeter(
            meterIds,
            period.from,
            period.to,
        )

        const rows: ReportChildRow[] = children.map((child, i) => {
            const meterId = meters[i]?.id
            const kwh = meterId === undefined ? undefined : totals.get(meterId)
            return {
                name: child.name,
                kwhConsumed: kwh === undefined ? null : round(kwh, 3),
                sharePercent:
                    kwh === undefined || parentTotalKwh <= 0
                        ? null
                        : round((kwh / parentTotalKwh) * 100, 1),
            }
        })
        rows.sort((a, b) => (b.kwhConsumed ?? -1) - (a.kwhConsumed ?? -1))

        return { kind: isProperty ? "Ambientes" : "Dispositivos", rows }
    }

    private async buildMonthlyExtras(
        userId: string,
        input: Extract<CreateReportInput, { type: "MONTHLY" }>,
        meterId: string,
        totalKwh: number,
    ): Promise<ReportMonthlyExtras> {
        const previous = monthToPeriod(previousMonth(input.month))
        const previousTotals = await this.consumptionRepository.findKwhTotalsByMeter(
            [meterId],
            previous.from,
            previous.to,
        )
        const previousMonthKwh = previousTotals.get(meterId) ?? 0

        return {
            costBrl: await this.resolveMonthCost(userId, input),
            previousMonthKwh: round(previousMonthKwh, 3),
            variationPercent:
                previousMonthKwh > 0
                    ? round(((totalKwh - previousMonthKwh) / previousMonthKwh) * 100, 1)
                    : null,
        }
    }

    // O custo mensal reaproveita o cálculo do módulo de consumo. Sub-níveis do
    // Grupo A e da Tarifa Branca não têm custo calculável (a conta é da
    // propriedade inteira) e lá falham com ValidationError — aqui isso vira
    // "sem custo", não relatório quebrado.
    private async resolveMonthCost(
        userId: string,
        input: Extract<CreateReportInput, { type: "MONTHLY" }>,
    ): Promise<number | null> {
        const { from, to } = monthToPeriod(input.month)
        try {
            const result = await this.consumptionService.list(userId, {
                targetType: input.targetType,
                targetId: input.targetId,
                granularity: "month",
                from,
                to,
                order: "asc",
                page: 1,
                pageSize: 1,
            })
            const cost = result.items[0]?.costBrl
            return cost === undefined ? null : round(cost, 2)
        } catch (error) {
            if (error instanceof ValidationError) return null
            throw error
        }
    }
}
