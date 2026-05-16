import { AlertTriangle, Download, Printer } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { buildDashboardCsv, buildDashboardCsvFilename } from "@/lib/csv/dashboardCsv"
import { downloadFile } from "@/lib/download/downloadFile"
import { ReportFilters } from "@/components/report/ReportFilters"
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards"
import { DashboardPropertiesChart } from "@/components/dashboard/DashboardPropertiesChart"
import { DashboardTimeSeriesChart } from "@/components/dashboard/DashboardTimeSeriesChart"
import { DashboardPropertiesTable } from "@/components/dashboard/DashboardPropertiesTable"
import type { DashboardData } from "@/types/dashboard.types"
import type { ReportFilters as ReportFiltersType } from "@/types/report.types"

interface DashboardViewProps {
    data: DashboardData
    filters: ReportFiltersType
    onFiltersChange: (next: ReportFiltersType) => void
    isPartial: boolean
    errorCount: number
    isRefetching?: boolean
    nowOverride?: Date
}

/**
 * Componente presentational do Dashboard.
 *
 * Composição em ordem (top-down):
 *   1. Filtros (period + presets + range) — print-hide
 *   2. Barra de ações (Imprimir) — print-hide
 *   3. Banner de erro parcial (condicional, print-hide)
 *   4. Summary cards (KPIs agregados)
 *   5. Ranking de propriedades (BarChart)
 *   6. Série temporal agregada (BarChart)
 *   7. Tabela de propriedades com link pro relatório individual
 *
 * Reuso do ReportFilters:
 *   O filtro do dashboard tem o mesmo contrato (period obrigatório,
 *   presets de data, range customizado) que o filtro de relatório. Em
 *   vez de duplicar, importamos diretamente — qualquer melhoria nesse
 *   componente aparece nos dois lugares de graça.
 *
 * Estados (NÃO tratados aqui):
 *   Loading e error fatais ficam na DashboardPage (camada de rota).
 *   Esta View assume que data já chegou; é responsável apenas pelo
 *   layout do conteúdo agregado.
 */
export const DashboardView = ({
    data,
    filters,
    onFiltersChange,
    isPartial,
    errorCount,
    isRefetching = false,
    nowOverride,
}: DashboardViewProps) => {
    const handleExportCsv = () => {
        const csv = buildDashboardCsv(data, filters)
        const filename = buildDashboardCsvFilename(filters)
        downloadFile(filename, "text/csv;charset=utf-8", csv)
    }

    return (
    <section
        className="flex flex-col gap-4"
        data-testid="dashboard-view"
    >
        {/* Filtros — print-hide pois não fazem sentido no papel */}
        <div className="print-hide">
            <ReportFilters
                value={filters}
                onChange={onFiltersChange}
                nowOverride={nowOverride}
            />
        </div>

        {/* Barra de ações — print-hide */}
        <div
            className="print-hide flex items-center justify-end gap-2"
            data-testid="dashboard-actions"
        >
            <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCsv}
                data-testid="dashboard-action-csv"
            >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exportar CSV
            </Button>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                data-testid="dashboard-action-print"
            >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Imprimir
            </Button>
        </div>

        {/* Aviso de erro parcial */}
        {isPartial && (
            <div
                role="status"
                data-testid="dashboard-partial-error"
                className={cn(
                    "print-hide flex items-start gap-3 rounded-lg border p-3 text-sm",
                    "border-amber-200 bg-amber-50 text-amber-900",
                    "dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
                )}
            >
                <AlertTriangle
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                />
                <p>
                    Não foi possível carregar{" "}
                    <strong className="font-semibold">
                        {errorCount} de {data.summary.propertyCount}
                    </strong>{" "}
                    {errorCount === 1 ? "propriedade" : "propriedades"}. O
                    restante está exibido abaixo.
                </p>
            </div>
        )}

        <DashboardSummaryCards summary={data.summary} />

        {/* Gráficos lado a lado em telas grandes, empilhados em mobile */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardPropertiesChart
                entries={data.perProperty}
                isRefetching={isRefetching}
            />
            <DashboardTimeSeriesChart
                points={data.timeSeries}
                period={filters.period}
                isRefetching={isRefetching}
            />
        </div>

        <DashboardPropertiesTable
            entries={data.perProperty}
            filters={filters}
        />
    </section>
    )
}