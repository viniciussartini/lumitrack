import { useEffect, useLayoutEffect, useRef, useState } from "react"
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
    // Só um dos dois (nunca ambos): `top` na abertura normal (abaixo do
    // trigger), `bottom` quando `useLayoutEffect` detecta que o menu
    // estouraria a viewport e inverte pra cima.
    top?: number
    bottom?: number
    right: number
}

/**
 * Menu de ações (⋯) numa linha da tabela de alertas — Editar,
 * Habilitar/Desabilitar, Excluir. Sem "marcar como lido" (não existe
 * leitura — o alerta é um monitor contínuo, não um evento único).
 *
 * O menu é renderizado via portal em `document.body`: a linha
 * vive dentro do `<div className="overflow-x-auto">` de `AlertTable.tsx`,
 * e por regra do CSS um ancestral com `overflow-x` diferente de `visible`
 * também clipa/rola no eixo Y — um `position: absolute` comum, por mais
 * que estilizado como `.lt-menu`, ficaria preso dentro dessa caixa em vez
 * de sobrepor a página. O portal escapa da árvore de overflow por
 * completo; a posição é medida do trigger (`getBoundingClientRect`) e
 * aplicada como `position: fixed` inline (specificidade de `style` vence
 * o `position: absolute` de `.lt-menu` sem depender de ordem de cascata).
 *
 * Sem reposicionamento contínuo (sem floating-ui): a posição é medida na
 * abertura (embaixo do trigger) e corrigida uma única vez, depois do
 * primeiro layout, se estourar a viewport (inverte pra cima) — o menu
 * fecha ao rolar, então não precisa acompanhar a âncora depois disso.
 *
 * Acessibilidade por teclado: o portal tira o menu do fluxo de `Tab` a
 * partir do trigger (foi pro fim do `document.body`), então a abertura move
 * o foco pro primeiro item explicitamente, e `Escape` fecha o menu e devolve
 * o foco ao trigger — sem isso, as três únicas ações de manutenção de um
 * alerta (editar/habilitar/excluir) ficariam alcançáveis só por mouse.
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

    // Depois do primeiro layout do menu portalado: move o foco pro primeiro
    // item (o portal tirou o menu do fluxo de Tab do trigger) e, se o menu
    // estourar a viewport embaixo, inverte pra cima — `useLayoutEffect` roda
    // antes do paint, então a correção de posição não pisca na tela.
    useLayoutEffect(() => {
        if (!isMenuOpen || !menuRef.current || !triggerRef.current) return

        const menuRect = menuRef.current.getBoundingClientRect()
        if (menuRect.bottom > window.innerHeight) {
            const triggerRect = triggerRef.current.getBoundingClientRect()
            setPosition((prev) =>
                prev
                    ? { bottom: window.innerHeight - triggerRect.top + 4, right: prev.right }
                    : prev,
            )
        }

        menuRef.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }, [isMenuOpen])

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (isMenuOpen) {
            setIsMenuOpen(false)
            return
        }
        // Medido ANTES de abrir, fora do updater de `setIsMenuOpen` — um
        // updater precisa ser puro (o React pode reinvocá-lo em StrictMode
        // ou em renderização concorrente); ler o DOM ali dentro funcionava
        // por ser idempotente, mas é uma armadilha que não vale guardar.
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        // `clientWidth`, não `innerWidth`: `innerWidth` inclui a barra de
        // rolagem vertical, que não faz parte do bloco contentor de um
        // `position: fixed` — com scrollbar clássica, `innerWidth` deixava o
        // menu ~15px à esquerda do esperado.
        setPosition({
            top: rect.bottom + 4,
            right: document.documentElement.clientWidth - rect.right,
        })
        setIsMenuOpen(true)
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

    const handleMenuKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        setIsMenuOpen(false)
        triggerRef.current?.focus()
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
                    "rounded-md p-1.5 transition-colors",
                    "text-muted hover:bg-accent/7 hover:text-text",
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
                        onKeyDown={handleMenuKeyDown}
                        style={{
                            position: "fixed",
                            top: position.top,
                            bottom: position.bottom,
                            right: position.right,
                        }}
                        className="lt-menu w-52 overflow-hidden"
                    >
                        {onEdit && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleEditClick}
                                data-testid={`alert-menu-edit-${alert.id}`}
                                className="lt-menu-item border-t-0"
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
                                "lt-menu-item disabled:cursor-not-allowed disabled:opacity-60",
                                !onEdit && "border-t-0",
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
                            className="lt-menu-item lt-menu-item-danger"
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
