import { buildCsv, type CsvCell } from "@/modules/report/csv.js"
import type { ReportData } from "@/modules/report/report.types.js"
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
export function generateReportCsv(data: ReportData): Buffer {
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
