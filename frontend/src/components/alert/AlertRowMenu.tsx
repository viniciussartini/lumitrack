import { useEffect, useRef, useState } from "react"
import { Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import {
    useDeleteAlert,
    useMarkAlertAsRead,
} from "@/hooks/queries/useAlertMutations"
import { extractErrorMessage } from "@/services/api"
import { formatThresholdKwh } from "@/lib/formatters/alert"
import { cn } from "@/lib/cn"
import type { Alert } from "@/types/alert.types"

interface AlertRowMenuProps {
    alert: Alert
    onEdit?: () => void
    onAfterDelete?: () => void
}

/**
 * Menu de ações (⋯) numa linha da tabela de alertas.
 *
 * Testids seguem padrão `alert-menu-{action}-{id}` (em vez de
 * `alert-row-{id}-menu-{action}`) para evitar que o regex `/^alert-row-/`
 * capture tanto as linhas da tabela quanto os elementos internos.
 * Ex: `alert-menu-trigger-alert-1`, `alert-menu-edit-alert-1`.
 */
export const AlertRowMenu = ({
    alert,
    onEdit,
    onAfterDelete,
}: AlertRowMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const markAsRead = useMarkAlertAsRead()
    const deleteMutation = useDeleteAlert()

    const isTriggered = alert.triggeredAt !== null
    const isRead = alert.readAt !== null
    const canMarkAsRead = isTriggered && !isRead
    const canEdit = !isTriggered && Boolean(onEdit)

    useEffect(() => {
        if (!isMenuOpen) return
        const handler = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [isMenuOpen])

    const handleMarkAsReadClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen(false)
        try {
            await markAsRead.mutateAsync(alert.id)
        } catch (error) {
            toast.error("Erro ao marcar como lido", {
                description: extractErrorMessage(error),
            })
        }
    }

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen(false)
        onEdit?.()
    }

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen(false)
        setIsConfirmOpen(true)
    }

    const handleConfirmDelete = async () => {
        try {
            await deleteMutation.mutateAsync({
                id: alert.id,
                thresholdKwh: alert.thresholdKwh,
            })
            setIsConfirmOpen(false)
            onAfterDelete?.()
        } catch (error) {
            toast.error("Erro ao excluir alerta", {
                description: extractErrorMessage(error),
            })
        }
    }

    const thresholdLabel = formatThresholdKwh(alert.thresholdKwh)
    const triggerAriaLabel = `Opções do alerta de ${thresholdLabel}`

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    setIsMenuOpen((prev) => !prev)
                }}
                aria-label={triggerAriaLabel}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                data-testid={`alert-menu-trigger-${alert.id}`}
                className={cn(
                    "rounded-md p-1.5 text-slate-500 transition-colors",
                    "hover:bg-slate-100 hover:text-slate-700",
                    "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                )}
            >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>

            {isMenuOpen && (
                <div
                    role="menu"
                    aria-label={triggerAriaLabel}
                    data-testid={`alert-menu-${alert.id}`}
                    className={cn(
                        "absolute right-0 top-full z-20 mt-1 w-52",
                        "overflow-hidden rounded-md border bg-white shadow-lg",
                        "border-slate-200 dark:border-slate-700 dark:bg-slate-800",
                    )}
                >
                    {canMarkAsRead && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleMarkAsReadClick}
                            disabled={markAsRead.isPending}
                            data-testid={`alert-menu-mark-read-${alert.id}`}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                                "text-slate-700 hover:bg-slate-50",
                                "dark:text-slate-200 dark:hover:bg-slate-700",
                                "disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                        >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Marcar como lido
                        </button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleEditClick}
                            data-testid={`alert-menu-edit-${alert.id}`}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                                "text-slate-700 hover:bg-slate-50",
                                "dark:text-slate-200 dark:hover:bg-slate-700",
                            )}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Editar
                        </button>
                    )}

                    {isTriggered && onEdit && (
                        <p
                            data-testid={`alert-menu-rearm-hint-${alert.id}`}
                            className={cn(
                                "border-b border-slate-200 px-3 py-2 text-xs",
                                "text-slate-500 dark:border-slate-700 dark:text-slate-400",
                            )}
                        >
                            Para receber novo aviso, exclua e crie outro.
                        </p>
                    )}

                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleDeleteClick}
                        data-testid={`alert-menu-delete-${alert.id}`}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                            "text-red-600 hover:bg-red-50",
                            "dark:text-red-400 dark:hover:bg-red-950/30",
                        )}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Excluir
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title="Excluir alerta?"
                description={`O alerta de ${thresholdLabel} será excluído permanentemente. Essa ação não pode ser desfeita.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
                variant="danger"
            />
        </div>
    )
}