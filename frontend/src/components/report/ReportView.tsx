import { AlertCircle, FileBarChart, RefreshCw } from "lucide-react"
import { type UseQueryResult } from "@tanstack/react-query"
import { cn } from "@/lib/cn"
import { EmptyState } from "@/components/ui/EmptyState"
import { ReportFilters } from "@/components/report/ReportFilters"
import { ReportSummaryCards } from "@/components/report/ReportSummaryCards"
import { ReportChart } from "@/components/report/ReportChart"
import { ReportRecordsTable } from "@/components/report/ReportRecordsTable"
import { ReportActions } from "@/components/report/ReportActions"
import { formatGeneratedAt, formatReportDate } from "@/lib/formatters/report"
import { extractErrorMessage } from "@/services/api"
import type {
    ReportFilters as ReportFiltersType,
    ReportResult,
} from "@/types/report.types"

interface ReportViewProps {
    query: UseQueryResult<ReportResult>
    filters: ReportFiltersType
    onFiltersChange: (next: ReportFiltersType) => void
    entityLabel: { artigo: "desta" | "deste"; nome: string }
    nowOverride?: Date
}

export const ReportView = ({
    query,
    filters,
    onFiltersChange,
    entityLabel,
    nowOverride,
}: ReportViewProps) => {
    const isRefetching = query.isFetching && Boolean(query.data)

    return (
        <section
            className="flex flex-col gap-4"
            data-testid="report-view"
        >
            {/* Filtros — print-hide, não fazem sentido no papel */}
            <div className="print-hide">
                <ReportFilters
                    value={filters}
                    onChange={onFiltersChange}
                    nowOverride={nowOverride}
                />
            </div>

            {query.isLoading && <ReportSkeleton />}

            {query.isError && (
                <div
                    role="alert"
                    className={cn(
                        "print-hide flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-sm">
                        {extractErrorMessage(query.error)}
                    </p>
                </div>
            )}

            {query.isSuccess && (
                <>
                    {/* Linha de meta + ações.
                        - Em desktop: meta à esquerda, botões à direita
                        - Em mobile: meta em cima, botões embaixo (flex-wrap) */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <ReportMeta
                            result={query.data}
                            isRefetching={isRefetching}
                        />
                        <ReportActions
                            result={query.data}
                            entityLabel={entityLabel}
                        />
                    </div>

                    <ReportSummaryCards summary={query.data.summary} />

                    {query.data.records.length === 0 ? (
                        <EmptyState
                            icon={FileBarChart}
                            title="Sem registros no intervalo"
                            description={`Não há registros de consumo ${entityLabel.artigo} ${entityLabel.nome} para os filtros aplicados. Tente ampliar o intervalo de datas ou alterar o período.`}
                        />
                    ) : (
                        <>
                            <ReportChart
                                records={query.data.records}
                                isRefetching={isRefetching}
                            />
                            <ReportRecordsTable records={query.data.records} />
                        </>
                    )}
                </>
            )}
        </section>
    )
}

interface ReportMetaProps {
    result: ReportResult
    isRefetching: boolean
}

const ReportMeta = ({ result, isRefetching }: ReportMetaProps) => {
    const generatedAt = formatGeneratedAt(result.generatedAt)
    const rangeText = result.dateRange
        ? `${formatReportDate(result.dateRange.from)} – ${formatReportDate(result.dateRange.to)}`
        : "Todos os registros"

    return (
        <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400"
            data-testid="report-meta"
        >
            <span>
                <span className="font-medium">Gerado em:</span> {generatedAt}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>
                <span className="font-medium">Intervalo:</span> {rangeText}
            </span>

            {isRefetching && (
                <span
                    className="print-hide inline-flex items-center gap-1 text-brand-600 dark:text-brand-400"
                    data-testid="report-refetching-indicator"
                    aria-live="polite"
                >
                    <RefreshCw
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                    />
                    Atualizando…
                </span>
            )}
        </div>
    )
}

const ReportSkeleton = () => (
    <div
        className="print-hide flex flex-col gap-3"
        aria-busy="true"
        aria-label="Carregando relatório"
        data-testid="report-skeleton"
    >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50"
                />
            ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50" />
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/50"
                />
            ))}
        </div>
    </div>
)