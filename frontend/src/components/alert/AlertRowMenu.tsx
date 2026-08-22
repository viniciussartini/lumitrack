import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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

interface MenuPosition {
    top: number
    right: number
}

/**
 * Menu de ações (⋯) numa linha da tabela de alertas (Fase 5) — Editar,
 * Habilitar/Desabilitar, Excluir. Sem mais "marcar como lido" (não existe
 * mais leitura — o alerta é um monitor contínuo, não um evento único).
 *
 * O menu é renderizado via portal em `document.body` (issue #231): a linha
 * vive dentro do `<div className="overflow-x-auto">` de `AlertTable.tsx`,
 * e por regra do CSS um ancestral com `overflow-x` diferente de `visible`
 * também clipa/rola no eixo Y — um `position: absolute` comum, por mais
 * que estilizado como `.lt-menu`, ficaria preso dentro dessa caixa em vez
 * de sobrepor a página. O portal escapa da árvore de overflow por
 * completo; a posição é medida do trigger (`getBoundingClientRect`) e
 * aplicada como `position: fixed` inline (specificidade de `style` vence
 * o `position: absolute` de `.lt-menu` sem depender de ordem de cascata).
 *
 * Sem reposicionamento contínuo (sem floating-ui): a posição é medida uma
 * vez, na abertura, e o menu fecha ao rolar — mais simples que manter a
 * âncora sincronizada, e rolar enquanto o menu está aberto já é raro.
 */
export const AlertRowMenu = ({ alert, onEdit }: AlertRowMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [position, setPosition] = useState<MenuPosition | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const patchEnabled = usePatchAlertEnabled()
    const deleteMutation = useDeleteAlert()

    // Fecha ao clicar fora — trigger e o menu portalado contam como
    // "dentro" (o menu não é mais descendente do trigger no DOM).
    useEffect(() => {
        if (!isMenuOpen) return
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return
            }
            setIsMenuOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [isMenuOpen])

    // Fecha ao rolar (qualquer ancestral, `capture: true`) — a posição
    // medida na abertura fica obsoleta assim que algo rola.
    useEffect(() => {
        if (!isMenuOpen) return
        const handleScroll = () => setIsMenuOpen(false)
        window.addEventListener("scroll", handleScroll, true)
        window.addEventListener("resize", handleScroll)
        return () => {
            window.removeEventListener("scroll", handleScroll, true)
            window.removeEventListener("resize", handleScroll)
        }
    }, [isMenuOpen])

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen((prev) => {
            const next = !prev
            if (next) {
                const rect = triggerRef.current?.getBoundingClientRect()
                if (rect) {
                    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                }
            }
            return next
        })
    }

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
        <div>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleTriggerClick}
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

            {isMenuOpen &&
                position &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label={triggerAriaLabel}
                        data-testid={`alert-menu-${alert.id}`}
                        style={{ position: "fixed", top: position.top, right: position.right }}
                        className="lt-menu w-52 overflow-hidden"
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
                    </div>,
                    document.body,
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
