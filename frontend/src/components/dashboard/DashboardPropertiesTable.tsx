import { Link } from "react-router-dom"
import { AlertCircle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import { ReportTrendBadge } from "@/components/report/ReportTrendBadge"
import type { DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportFilters } from "@/types/report.types"

interface DashboardPropertiesTableProps {
    entries: DashboardPropertyEntry[]
    filters: ReportFilters
}

/**
 * Tabela com o detalhamento por propriedade.
 *
 * Diferente dos gráficos, esta tabela inclui TODAS as entries — sucessos
 * E erros. Erros aparecem como linha "indisponível" com a mensagem. É o
 * único lugar do dashboard onde o user vê informação granular de falha
 * por propriedade.
 *
 * Cada linha é clicável → vai pro relatório individual da propriedade
 * (`/propriedades/:id/relatorio`) preservando os filtros atuais. Padrão
 * de "click no card vai para detalhes" do projeto, ajustado pro contexto
 * tabular (toda a linha vira link).
 *
 * Preservação de filtros no link:
 *   Quando o user clica numa propriedade do dashboard, faz sentido
 *   abrir o relatório com o MESMO período/range. Construímos a query
 *   string a partir dos `filters` correntes. Mesmo padrão do
 *   serializeReportFiltersToParams (inline aqui pra evitar dependência
 *   cruzada — esse módulo é simples o suficiente).
 *
 * Acessibilidade:
 *   - <table role="table"> implícito. Headers reais via <th>.
 *   - Linha inteira é link (<Link>) com aria-label descritivo.
 *   - data-testid="dashboard-property-row-{id}" para E2E.
 */

const buildReportLink = (
    propertyId: string,
    filters: ReportFilters,
): string => {
    const params = new URLSearchParams()
    params.set("period", filters.period)
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
    if (filters.dateTo) params.set("dateTo", filters.dateTo)
    return `/propriedades/${propertyId}/relatorio?${params.toString()}`
}

export const DashboardPropertiesTable = ({
    entries,
    filters,
}: DashboardPropertiesTableProps) => {
    if (entries.length === 0) {
        return (
            <div
                data-testid="dashboard-properties-table-empty"
                className={cn(
                    "rounded-lg border p-6 text-center",
                    "border-slate-200 bg-white",
                    "dark:border-slate-800 dark:bg-slate-950",
                )}
            >
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma propriedade para exibir.
                </p>
            </div>
        )
    }

    return (
        <div
            data-testid="dashboard-properties-table"
            className={cn(
                "overflow-hidden rounded-lg border",
                "border-slate-200 bg-white",
                "dark:border-slate-800 dark:bg-slate-950",
            )}
        >
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Detalhamento por propriedade
                </h3>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <th scope="col" className="px-4 py-2">
                                Propriedade
                            </th>
                            <th scope="col" className="px-4 py-2 text-right">
                                Consumo
                            </th>
                            <th scope="col" className="px-4 py-2 text-right">
                                Custo
                            </th>
                            <th scope="col" className="px-4 py-2 text-right">
                                Registros
                            </th>
                            <th scope="col" className="px-4 py-2">
                                Tendência
                            </th>
                            <th scope="col" className="w-8 px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <PropertyRow
                                key={entry.propertyId}
                                entry={entry}
                                filters={filters}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

interface PropertyRowProps {
    entry: DashboardPropertyEntry
    filters: ReportFilters
}

const PropertyRow = ({ entry, filters }: PropertyRowProps) => {
    // Erro: linha com aviso, SEM link (o relatório individual também
    // falharia). Fica como linha "informativa".
    if (entry.status === "error" || !entry.result) {
        return (
            <tr
                data-testid={`dashboard-property-row-${entry.propertyId}`}
                className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
            >
                <td className="px-4 py-3">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                        {entry.propertyName}
                    </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-400" colSpan={3}>
                    <span
                        className="inline-flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300"
                        role="alert"
                    >
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {entry.error ?? "Não foi possível carregar"}
                    </span>
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
            </tr>
        )
    }

    const { summary } = entry.result
    const href = buildReportLink(entry.propertyId, filters)

    return (
        <tr
            data-testid={`dashboard-property-row-${entry.propertyId}`}
            className={cn(
                "border-b border-slate-100 last:border-b-0",
                "transition-colors hover:bg-slate-50",
                "dark:border-slate-800 dark:hover:bg-slate-900/50",
            )}
        >
            <td className="px-4 py-3">
                <Link
                    to={href}
                    aria-label={`Ver relatório de ${entry.propertyName}`}
                    className="font-medium text-slate-900 hover:text-brand-700 focus:outline-none focus-visible:underline dark:text-slate-100 dark:hover:text-brand-300"
                >
                    {entry.propertyName}
                </Link>
            </td>
            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {formatKwh(summary.totalKwh)} kWh
            </td>
            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {formatCostBrl(summary.totalCostBrl)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                {summary.recordCount}
            </td>
            <td className="px-4 py-3">
                <ReportTrendBadge trend={summary.trend} />
            </td>
            <td className="px-4 py-3 text-right">
                <Link
                    to={href}
                    aria-label={`Abrir relatório de ${entry.propertyName}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </td>
        </tr>
    )
}