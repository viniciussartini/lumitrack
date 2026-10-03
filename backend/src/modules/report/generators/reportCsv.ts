import { buildCsv, type CsvCell } from "@/modules/report/csv.js"
import {
    isReportDocument,
    type ReportCell,
    type ReportContent,
    type ReportData,
    type ReportDocument,
} from "@/modules/report/report.types.js"
import {
    formatInstantDateTime,
    formatLocalDay,
    formatPeriodLabel,
    reportTitle,
} from "@/modules/report/generators/format.js"

/**
 * CSV do relatório: um bloco de resumo (chave;valor) seguido das tabelas, cada
 * uma separada por linha em branco. Os números saem crus (sem unidade
 * embutida) para a planilha poder somá-los; a unidade vai no cabeçalho.
 *
 * @param data - Dados do relatório, já agregados.
 * @returns O arquivo em bytes.
 */
export function generateReportCsv(data: ReportContent): Buffer {
    return isReportDocument(data) ? generateDocumentCsv(data) : generateConsumptionCsv(data)
}

// O CSV leva o número sem formatação, mas arredondado às casas de exibição
// (um ponto flutuante como 0,9600000000000001 não vai para a planilha); a
// ausência sai como "-", como nas demais células.
const toCsvCell = (cell: ReportCell): CsvCell => {
    if (cell === null || typeof cell !== "object") return cell
    if (cell.value === null) return null
    const factor = 10 ** cell.digits
    return Math.round(cell.value * factor) / factor
}

function generateDocumentCsv(data: ReportDocument): Buffer {
    const rows: CsvCell[][] = [
        [reportTitle(data.type)],
        [data.target.kind, data.target.name],
        ["Propriedade", data.property.name],
        ["Distribuidora", data.property.distributorName],
        ["Enquadramento", data.property.tariffLabel],
        ["Período", formatPeriodLabel(data.period.from, data.period.to)],
        ["Emitido em", formatInstantDateTime(data.generatedAt)],
        [],
        ...data.summary.map((line): CsvCell[] => [line.label, toCsvCell(line.value)]),
    ]

    for (const table of data.tables) {
        rows.push(
            [],
            [table.title],
            table.columns.map((column) => column.header),
        )
        if (table.rows.length === 0) rows.push([table.emptyNote])
        for (const row of table.rows) rows.push(row.map(toCsvCell))
    }

    if (data.notes.length > 0) rows.push([], ...data.notes.map((note): CsvCell[] => [note]))
    return buildCsv(rows)
}

function generateConsumptionCsv(data: ReportData): Buffer {
    const rows: CsvCell[][] = [
        [reportTitle(data.type)],
        [data.target.kind, data.target.name],
        ["Propriedade", data.property.name],
        ["Distribuidora", data.property.distributorName],
        ["Enquadramento", data.property.tariffLabel],
        ["Período", formatPeriodLabel(data.period.from, data.period.to)],
        ["Emitido em", formatInstantDateTime(data.generatedAt)],
        [],
        ["Consumo total (kWh)", data.kpis.totalKwh],
        ["Média diária (kWh)", data.kpis.averageDailyKwh],
        ["Dia de maior consumo", data.kpis.peakDay ? formatLocalDay(data.kpis.peakDay.day) : null],
        ["Consumo do dia de pico (kWh)", data.kpis.peakDay?.kwhConsumed ?? null],
    ]

    if (data.monthly) {
        rows.push(
            ["Custo do mês (R$)", data.monthly.costBrl],
            ["Consumo do mês anterior (kWh)", data.monthly.previousMonthKwh],
            ["Variação sobre o mês anterior (%)", data.monthly.variationPercent],
        )
    }

    rows.push([], ["Dia", "Consumo (kWh)", "Potência média (W)"])
    for (const row of data.daily) {
        rows.push([formatLocalDay(row.day), row.kwhConsumed, row.avgPowerW])
    }

    if (data.children) {
        rows.push([], [data.children.kind, "Consumo (kWh)", "Participação (%)"])
        for (const child of data.children.rows) {
            rows.push([child.name, child.kwhConsumed, child.sharePercent])
        }
    }

    return buildCsv(rows)
}
