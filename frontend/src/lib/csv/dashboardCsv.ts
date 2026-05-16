import {
    formatKwh,
    formatCostBrl,
} from "@/lib/formatters/consumption"
import { REPORT_PERIOD_LABELS } from "@/types/report.types"
import { REPORT_TREND_LABELS, formatGeneratedAt, formatReportDate } from "@/lib/formatters/report"
import { escapeCsvCell } from "@/lib/csv/reportCsv"
import type { DashboardData } from "@/types/dashboard.types"
import type { ReportFilters } from "@/types/report.types"

/**
 * Builder CSV do Dashboard agregado.
 *
 * Formato: resumo por propriedade (opção A confirmada).
 * Granularidade: 1 linha por propriedade — espelha a tabela do dashboard.
 * Útil no Excel: o usuário abre, ordena por kWh, filtra por tendência.
 *
 * Estrutura do arquivo final:
 *   Bloco 1 — Metadados globais (4–6 linhas)
 *     Período, Intervalo, Gerado em, Total de propriedades,
 *     Consumo total, Custo total
 *   Linha em branco (separador visual)
 *   Bloco 2 — Tabela de propriedades
 *     Header: Propriedade | Consumo (kWh) | Custo (BRL) | Registros | Tendência | Status
 *     N linhas de dados (sucesso) ou linha de erro (status=Indisponível)
 *
 * Reusa `escapeCsvCell` do reportCsv — mesma RFC 4180, sem duplicar.
 * Reusa formatters de consumption e report — consistência com a UI.
 *
 * Nome do arquivo: `dashboard_{period}_{yyyy-mm-dd}.csv`
 *   Sem ID de entidade (não há — é cross-propriedade).
 */

const TABLE_HEADER: readonly string[] = [
    "Propriedade",
    "Consumo (kWh)",
    "Custo (BRL)",
    "Registros",
    "Tendência",
    "Status",
] as const

/**
 * Constrói o nome do arquivo.
 * Formato: `dashboard_{period}_{yyyy-mm-dd}.csv`
 */
export const buildDashboardCsvFilename = (
    filters: ReportFilters,
    now: Date = new Date(),
): string => {
    const period = filters.period.toLowerCase()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `dashboard_${period}_${year}-${month}-${day}.csv`
}

/**
 * Formata o intervalo de datas dos filtros em "DD/MM/AAAA – DD/MM/AAAA".
 * Quando não há datas: "Todos os registros".
 */
const formatFilterRange = (filters: ReportFilters): string => {
    if (!filters.dateFrom && !filters.dateTo) return "Todos os registros"
    const from = filters.dateFrom ? formatReportDate(filters.dateFrom) : "?"
    const to = filters.dateTo ? formatReportDate(filters.dateTo) : "?"
    return `${from} – ${to}`
}

/**
 * Bloco de metadados globais do dashboard.
 */
const buildMetaRows = (
    data: DashboardData,
    filters: ReportFilters,
    now: Date,
): string[][] => [
    ["Período", REPORT_PERIOD_LABELS[filters.period]],
    ["Intervalo", formatFilterRange(filters)],
    ["Gerado em", formatGeneratedAt(now.toISOString())],
    ["Total de propriedades", String(data.summary.propertyCount)],
    [
        "Propriedades com dados",
        String(data.summary.propertyWithDataCount),
    ],
    ["Consumo total (kWh)", formatKwh(data.summary.totalKwh)],
    ["Custo total (BRL)", formatCostBrl(data.summary.totalCostBrl)],
]

/**
 * Linha de dados para uma propriedade com sucesso.
 */
const buildSuccessRow = (
    entry: DashboardData["perProperty"][number] & { status: "success" },
): string[] => {
    const s = entry.result!.summary
    return [
        entry.propertyName,
        formatKwh(s.totalKwh),
        formatCostBrl(s.totalCostBrl),
        String(s.recordCount),
        REPORT_TREND_LABELS[s.trend],
        "OK",
    ]
}

/**
 * Linha de dados para uma propriedade com erro (indisponível).
 */
const buildErrorRow = (
    entry: DashboardData["perProperty"][number] & { status: "error" },
): string[] => [
    entry.propertyName,
    "—",
    "—",
    "—",
    "—",
    entry.error ?? "Indisponível",
]

/**
 * Monta o CSV completo do Dashboard agregado.
 *
 * Inclui BOM UTF-8 (\uFEFF) — Excel-pt-BR ignora a codificação sem ele.
 * Quebras de linha CRLF (\r\n) — RFC 4180.
 *
 * O parâmetro `now` existe para testes determinísticos — em produção
 * chame sem ele (usa `new Date()`).
 */
export const buildDashboardCsv = (
    data: DashboardData,
    filters: ReportFilters,
    now: Date = new Date(),
): string => {
    const BOM = "\uFEFF"
    const NL = "\r\n"

    const dataRows = data.perProperty.map((entry) =>
        entry.status === "success"
            ? buildSuccessRow(
                entry as DashboardData["perProperty"][number] & {
                    status: "success"
                },
            )
            : buildErrorRow(
                entry as DashboardData["perProperty"][number] & {
                    status: "error"
                },
            ),
    )

    const rows: string[][] = [
        ...buildMetaRows(data, filters, now),
        [],
        [...TABLE_HEADER],
        ...dataRows,
    ]

    const body = rows
        .map((row) => row.map(escapeCsvCell).join(","))
        .join(NL)

    return BOM + body
}