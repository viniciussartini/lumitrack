import { useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ReportScheduleForm } from "@/components/report/ReportScheduleForm"
import { Blueprint } from "@/components/ui/Blueprint"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { FormDialog } from "@/components/ui/FormDialog"
import { Pagination } from "@/components/ui/Pagination"
import { Tag } from "@/components/ui/Tag"
import {
    useDeleteReportSchedule,
    useReportSchedules,
    useUpdateReportSchedule,
} from "@/hooks/queries/useReportSchedules"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import { buildTargetLabelIndex } from "@/lib/reportHistory"
import { describeSchedule, type ScheduleRowView } from "@/lib/reportSchedule"
import { extractErrorMessage } from "@/services/api"
import type { ReportSchedule } from "@/types/report.types"

interface ReportScheduleListProps {
    /** Alvos do cadastro, para mostrar o nome de cada configuração e alimentar a edição. */
    groups: CompareTargetGroup[]
}

/**
 * Bloco "Configurações criadas" (LumiTrack Home v2.dc.html, Configurações →
 * Relatórios) — lista paginada com a próxima execução de cada configuração
 * ativa, editar (em modal) e excluir (com confirmação).
 */
export const ReportScheduleList = ({ groups }: ReportScheduleListProps) => {
    const [page, setPage] = useState(1)
    const [editing, setEditing] = useState<ReportSchedule | null>(null)
    const [deleting, setDeleting] = useState<ReportSchedule | null>(null)
    const query = useReportSchedules(page)
    const targetLabels = useMemo(() => buildTargetLabelIndex(groups), [groups])

    return (
        <Blueprint className="p-0" data-testid="report-schedule-list">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Configurações criadas
                </span>
                <span className="text-muted mt-0.5 block text-xs">
                    Relatórios agendados nesta conta.
                </span>
            </div>

            <ListBody
                query={query}
                targetLabels={targetLabels}
                onEdit={setEditing}
                onDelete={setDeleting}
            />

            {query.data && (
                <div className="px-5 pb-4">
                    <Pagination
                        page={query.data.page}
                        pageSize={query.data.pageSize}
                        total={query.data.total}
                        onPageChange={setPage}
                        className="border-divider border-t pt-3"
                    />
                </div>
            )}

            <EditScheduleDialog
                schedule={editing}
                groups={groups}
                onClose={() => setEditing(null)}
            />
            <DeleteScheduleDialog
                schedule={deleting}
                onClose={() => setDeleting(null)}
                // Excluir o último item da última página deixaria a página vazia.
                onDeleted={() => {
                    if (query.data?.items.length === 1 && page > 1) setPage(page - 1)
                }}
            />
        </Blueprint>
    )
}

interface EditScheduleDialogProps {
    schedule: ReportSchedule | null
    groups: CompareTargetGroup[]
    onClose: () => void
}

const EditScheduleDialog = ({ schedule, groups, onClose }: EditScheduleDialogProps) => {
    const update = useUpdateReportSchedule()

    return (
        <FormDialog
            open={schedule !== null}
            onOpenChange={(open) => !open && onClose()}
            kicker="Editar"
            title="Editar configuração"
        >
            {schedule && (
                <ReportScheduleForm
                    // Remonta o formulário ao trocar de configuração: o rascunho é estado local.
                    key={schedule.id}
                    groups={groups}
                    initial={schedule}
                    submitLabel="Salvar"
                    isSubmitting={update.isPending}
                    onCancel={onClose}
                    onSubmit={(input) =>
                        update.mutate(
                            { id: schedule.id, input },
                            {
                                onSuccess: onClose,
                                onError: (error) =>
                                    toast.error("Não foi possível salvar a configuração", {
                                        description: extractErrorMessage(error),
                                    }),
                            },
                        )
                    }
                />
            )}
        </FormDialog>
    )
}

interface DeleteScheduleDialogProps {
    schedule: ReportSchedule | null
    onClose: () => void
    onDeleted: () => void
}

const DeleteScheduleDialog = ({ schedule, onClose, onDeleted }: DeleteScheduleDialogProps) => {
    const remove = useDeleteReportSchedule()

    const confirm = () => {
        if (!schedule) return
        remove.mutate(schedule.id, {
            onSuccess: () => {
                onClose()
                onDeleted()
            },
            onError: (error) => {
                onClose()
                toast.error("Não foi possível excluir a configuração", {
                    description: extractErrorMessage(error),
                })
            },
        })
    }

    return (
        <ConfirmDialog
            open={schedule !== null}
            onOpenChange={(open) => !open && onClose()}
            title="Excluir configuração"
            description="Os envios automáticos desta configuração deixam de acontecer. Os relatórios já gerados continuam no histórico."
            confirmLabel="Excluir"
            isLoading={remove.isPending}
            onConfirm={confirm}
        />
    )
}

interface ListBodyProps {
    query: ReturnType<typeof useReportSchedules>
    targetLabels: Map<string, string>
    onEdit: (schedule: ReportSchedule) => void
    onDelete: (schedule: ReportSchedule) => void
}

const ListBody = ({ query, targetLabels, onEdit, onDelete }: ListBodyProps) => {
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
                Não foi possível carregar as configurações.
            </p>
        )
    }
    if (query.data.items.length === 0) {
        return (
            <p data-testid="report-schedule-empty" className="text-muted p-8 text-center text-sm">
                Nenhuma configuração criada.
            </p>
        )
    }

    return (
        <ul>
            {query.data.items.map((schedule) => (
                <ScheduleRow
                    key={schedule.id}
                    schedule={schedule}
                    view={describeSchedule(schedule, targetLabels)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </ul>
    )
}

interface ScheduleRowProps {
    schedule: ReportSchedule
    view: ScheduleRowView
    onEdit: (schedule: ReportSchedule) => void
    onDelete: (schedule: ReportSchedule) => void
}

const ScheduleRow = ({ schedule, view, onEdit, onDelete }: ScheduleRowProps) => (
    <li className="border-divider flex flex-wrap items-center gap-3 border-t px-5 py-3">
        <div className="min-w-48 flex-1">
            <div className="text-sm font-semibold">{view.title}</div>
            <div className="text-muted mt-0.5 text-xs">{view.meta}</div>
            {view.nextRun && (
                <div className="text-muted mt-0.5 text-xs">Próximo envio: {view.nextRun}</div>
            )}
        </div>
        <Tag variant={schedule.active ? "accent" : "neutral"}>
            {schedule.active ? "Ativa" : "Pausada"}
        </Tag>
        <div className="flex gap-2">
            <button
                type="button"
                className="lt-iconbtn"
                title="Editar"
                aria-label={`Editar ${view.title}`}
                onClick={() => onEdit(schedule)}
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="lt-iconbtn"
                title="Excluir"
                aria-label={`Excluir ${view.title}`}
                onClick={() => onDelete(schedule)}
            >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    </li>
)
