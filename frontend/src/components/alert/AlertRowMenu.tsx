import { useEffect, useRef, useState } from "react"
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteAlert, usePatchAlertEnabled } from "@/hooks/queries/useAlertMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { AlertWithStatus } from "@/types/alert.types"

interface AlertRowMenuProps {
    alert: AlertWithStatus
    onEdit?: () => void
}

/**
 * Menu de ações (⋯) numa linha da tabela de alertas (Fase 5) — Editar,
 * Habilitar/Desabilitar, Excluir. Sem mais "marcar como lido" (não existe
 * mais leitura — o alerta é um monitor contínuo, não um evento único).
 */
export const AlertRowMenu = ({ alert, onEdit }: AlertRowMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const patchEnabled = usePatchAlertEnabled()
    const deleteMutation = useDeleteAlert()

    useEffect(() => {
        if (!isMenuOpen) return
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [isMenuOpen])

    const handleToggleEnabled = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen(false)
        try {
            await patchEnabled.mutateAsync({ id: alert.id, enabled: !alert.enabled })
        } catch (error) {
            toast.error("Erro ao atualizar alerta", {
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
            await deleteMutation.mutateAsync(alert.id)
            setIsConfirmOpen(false)
        } catch (error) {
            toast.error("Erro ao excluir alerta", {
                description: extractErrorMessage(error),
            })
        }
    }

    const triggerAriaLabel = `Opções do alerta ${alert.name}`

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
                    "focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:outline-none",
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
                        "absolute top-full right-0 z-20 mt-1 w-52",
                        "overflow-hidden rounded-md border bg-white shadow-lg",
                        "border-slate-200 dark:border-slate-700 dark:bg-slate-800",
                    )}
                >
                    {onEdit && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleEditClick}
                            data-testid={`alert-menu-edit-${alert.id}`}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                "text-slate-700 hover:bg-slate-50",
                                "dark:text-slate-200 dark:hover:bg-slate-700",
                            )}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Editar
                        </button>
                    )}

                    <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => void handleToggleEnabled(e)}
                        disabled={patchEnabled.isPending}
                        data-testid={`alert-menu-toggle-enabled-${alert.id}`}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                            "text-slate-700 hover:bg-slate-50",
                            "dark:text-slate-200 dark:hover:bg-slate-700",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                    >
                        {alert.enabled ? (
                            <>
                                <PowerOff className="h-4 w-4" aria-hidden="true" />
                                Desabilitar
                            </>
                        ) : (
                            <>
                                <Power className="h-4 w-4" aria-hidden="true" />
                                Habilitar
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleDeleteClick}
                        data-testid={`alert-menu-delete-${alert.id}`}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
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
                description={`O alerta "${alert.name}" será excluído permanentemente. Essa ação não pode ser desfeita.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={() => void handleConfirmDelete()}
                variant="danger"
            />
        </div>
    )
}
