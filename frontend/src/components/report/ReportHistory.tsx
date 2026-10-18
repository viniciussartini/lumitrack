import { useMemo, useState } from "react"
import { Download, FileText, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Blueprint } from "@/components/ui/Blueprint"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Pagination } from "@/components/ui/Pagination"
import { useDeleteReport, useDownloadReport } from "@/hooks/queries/useReportMutations"
import { useReports } from "@/hooks/queries/useReports"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import { buildTargetLabelIndex, describeReport, type ReportRowView } from "@/lib/reportHistory"
import { extractErrorMessage } from "@/services/api"
import type { Report } from "@/types/report.types"

interface ReportHistoryProps {
    /** Alvos do cadastro, para mostrar o nome de cada relatório. */
    groups: CompareTargetGroup[]
}

/**
 * Bloco "Relatórios gerados" (LumiTrack Home v2.dc.html, view `reports`) —
 * lista paginada, com baixar e excluir em cada linha. A exclusão pede
 * confirmação e remove também o arquivo.
 */
export const ReportHistory = ({ groups }: ReportHistoryProps) => {
    const [page, setPage] = useState(1)
    const [pendingDelete, setPendingDelete] = useState<Report | null>(null)
    const reportsQuery = useReports(page)
    const download = useDownloadReport()
    const targetLabels = useMemo(() => buildTargetLabelIndex(groups), [groups])

    return (
        <Blueprint className="p-0" data-testid="report-history">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Relatórios gerados
                </span>
                <span className="text-muted mt-0.5 block text-xs">
                    Arquivos gerados manualmente e pelos envios agendados.
                </span>
            </div>

            <HistoryBody
                query={reportsQuery}
                targetLabels={targetLabels}
                isDownloading={download.isPending}
                onDownload={(report) => download.mutate(report)}
                onDelete={setPendingDelete}
            />

            {reportsQuery.data && (
                <div className="px-5 pb-4">
                    <Pagination
                        page={reportsQuery.data.page}
                        pageSize={reportsQuery.data.pageSize}
                        total={reportsQuery.data.total}
                        onPageChange={setPage}
                        className="border-divider border-t pt-3"
                    />
                </div>
            )}

            <DeleteReportDialog
                report={pendingDelete}
                onClose={() => setPendingDelete(null)}
                // Excluir o último item da última página deixaria a página vazia.
                onDeleted={() => {
                    if (reportsQuery.data?.items.length === 1 && page > 1) setPage(page - 1)
                }}
            />
        </Blueprint>
    )
}

interface DeleteReportDialogProps {
    report: Report | null
    onClose: () => void
    onDeleted: () => void
}

const DeleteReportDialog = ({ report, onClose, onDeleted }: DeleteReportDialogProps) => {
    const remove = useDeleteReport()

    const confirm = () => {
        if (!report) return
        remove.mutate(report.id, {
            onSuccess: () => {
                onClose()
                onDeleted()
            },
            onError: (error) => {
                onClose()
                toast.error("Não foi possível excluir o relatório", {
                    description: extractErrorMessage(error),
                })
            },
        })
    }

    return (
        <ConfirmDialog
            open={report !== null}
            onOpenChange={(open) => !open && onClose()}
            title="Excluir relatório"
            description="O arquivo será removido e não poderá ser baixado de novo. Esta ação não pode ser desfeita."
            confirmLabel="Excluir"
            isLoading={remove.isPending}
            onConfirm={confirm}
        />
    )
}

interface HistoryBodyProps {
    query: ReturnType<typeof useReports>
    targetLabels: Map<string, string>
    isDownloading: boolean
    onDownload: (report: Report) => void
    onDelete: (report: Report) => void
}

const HistoryBody = ({
    query,
    targetLabels,
    isDownloading,
    onDownload,
    onDelete,
}: HistoryBodyProps) => {
    if (query.isPending) {
        return (
            <p role="status" className="text-muted p-8 text-center text-sm">
                Carregando...
            </p>
        )
    }
    if (query.isError) {
        return (
            <p role="alert" className="text-status-danger p-8 text-center text-sm">
                Não foi possível carregar o histórico de relatórios.
            </p>
        )
    }
    if (query.data.items.length === 0) {
        return (
            <p data-testid="report-history-empty" className="text-muted p-8 text-center text-sm">
                Nenhum relatório gerado até agora.
            </p>
        )
    }

    return (
        <ul>
            {query.data.items.map((report) => (
                <ReportRow
                    key={report.id}
                    report={report}
                    view={describeReport(report, targetLabels)}
                    isDownloading={isDownloading}
                    onDownload={onDownload}
                    onDelete={onDelete}
                />
            ))}
        </ul>
    )
}

interface ReportRowProps {
    report: Report
    view: ReportRowView
    isDownloading: boolean
    onDownload: (report: Report) => void
    onDelete: (report: Report) => void
}

const ReportRow = ({ report, view, isDownloading, onDownload, onDelete }: ReportRowProps) => (
    <li className="border-divider flex flex-wrap items-center gap-3 border-t px-5 py-3">
        <FileText className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-48 flex-1">
            <div className="text-sm font-semibold">{view.title}</div>
            <div className="text-muted mt-0.5 text-xs">{view.subtitle}</div>
        </div>
        <span className="text-muted text-12-5 tabular-nums">{view.createdAt}</span>
        <div className="flex gap-2">
            <button
                type="button"
                className="lt-iconbtn"
                title="Baixar"
                aria-label={`Baixar ${view.title}`}
                disabled={isDownloading}
                onClick={() => onDownload(report)}
            >
                <Download className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="lt-iconbtn"
                title="Excluir"
                aria-label={`Excluir ${view.title}`}
                onClick={() => onDelete(report)}
            >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    </li>
)
