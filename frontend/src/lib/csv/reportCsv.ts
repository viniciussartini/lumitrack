import {
    CONSUMPTION_PERIOD_LABELS,
    type ConsumptionRecord,
} from "@/types/consumption.types"
import {
    formatKwh,
    formatCostBrl,
    formatReferenceDate,
} from "@/lib/formatters/consumption"
import {
    REPORT_PERIOD_LABELS,
} from "@/types/report.types"
import {
    REPORT_TREND_LABELS,
    formatGeneratedAt,
    formatReportDate,
} from "@/lib/formatters/report"
import type { ReportResult } from "@/types/report.types"

/**
 * Builder de CSV do Relatório.
 *
 * Estrutura do arquivo final:
 *   1. 9 linhas de cabeçalho com metadados do relatório
 *   2. 1 linha em branco (separador visual)
 *   3. Header da tabela
 *   4. N linhas de dados (1 por record)
 *
 * Separador: vírgula (CSV padrão internacional / RFC 4180).
 * Decimal: vírgula (pt-BR via formatters) → células numéricas são
 * escapadas com aspas pelo `escapeCsvCell`.
 */

/**
 * Escapa uma célula CSV conforme RFC 4180.
 *
 * Regras:
 *   - Se contém vírgula, aspa dupla ou quebra de linha → envolve em aspas.
 *   - Aspas duplas internas → duplicadas ("" no lugar de ").
 */
export const escapeCsvCell = (value: string): string => {
    const needsQuoting = /[",\n\r]/.test(value)
    if (!needsQuoting) return value
    return `"${value.replace(/"/g, '""')}"`
}

/**
 * Constrói o nome do arquivo CSV.
 * Formato: `relatorio_{target_label}_{yyyy-mm-dd}.csv`
 */
export const buildCsvFilename = (
    result: ReportResult,
    now: Date = new Date(),
): string => {
    const targetLabel = (() => {
        switch (result.target.type) {
            case "PROPERTY":
                return `property_${result.target.propertyId.slice(0, 8)}`
            case "AREA":
                return `area_${result.target.areaId.slice(0, 8)}`
            case "DEVICE":
                return `device_${result.target.deviceId.slice(0, 8)}`
        }
    })()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `relatorio_${targetLabel}_${year}-${month}-${day}.csv`
}

interface EntityLabel {
    artigo: "desta" | "deste"
    nome: string
}

const buildMetaRows = (
    result: ReportResult,
    entityLabel: EntityLabel,
): string[][] => {
    const targetText = `Relatório ${entityLabel.artigo} ${entityLabel.nome}`
    const periodLabel = REPORT_PERIOD_LABELS[result.period]
    const rangeText = result.dateRange
        ? `${formatReportDate(result.dateRange.from)} – ${formatReportDate(result.dateRange.to)}`
        : "Todos os registros"
    const generatedAt = formatGeneratedAt(result.generatedAt)

    return [
        ["Alvo", targetText],
        ["Período", periodLabel],
        ["Intervalo", rangeText],
        ["Gerado em", generatedAt],
        ["Consumo total (kWh)", formatKwh(result.summary.totalKwh)],
        ["Custo total (BRL)", formatCostBrl(result.summary.totalCostBrl)],
        ["Média por registro (kWh)", formatKwh(result.summary.avgKwhPerRecord)],
        ["Registros", String(result.summary.recordCount)],
        ["Tendência", REPORT_TREND_LABELS[result.summary.trend]],
    ]
}

const TABLE_HEADER: readonly string[] = [
    "Período",
    "Data",
    "kWh",
    "Custo (BRL)",
    "Observações",
] as const

const buildDataRow = (record: ConsumptionRecord): string[] => [
    CONSUMPTION_PERIOD_LABELS[record.period],
    formatReferenceDate(record.referenceDate, record.period),
    formatKwh(record.kwhConsumed),
    formatCostBrl(record.costBrl),
    record.notes ?? "",
]

/**
 * Monta o CSV completo do relatório.
 *
 * Inclui BOM UTF-8 (\uFEFF) — Excel-pt-BR ignora a codificação sem ele.
 * Quebras de linha CRLF (\r\n) — RFC 4180.
 */
export const buildReportCsv = (
    result: ReportResult,
    entityLabel: EntityLabel,
): string => {
    const BOM = "\uFEFF"
    const NL = "\r\n"

    const rows: string[][] = [
        ...buildMetaRows(result, entityLabel),
        [],
        [...TABLE_HEADER],
        ...result.records.map(buildDataRow),
    ]

    const body = rows
        .map((row) => row.map(escapeCsvCell).join(","))
        .join(NL)

    return BOM + body
}