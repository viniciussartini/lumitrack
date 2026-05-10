import { useEffect, useRef, useState } from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteConsumption } from "@/hooks/queries/useConsumptionMutations"
import { extractErrorMessage } from "@/services/api"
import { formatReferenceDate } from "@/lib/formatters/consumption"
import { cn } from "@/lib/cn"
import type { ConsumptionRecord } from "@/types/consumption.types"

interface ConsumptionRowMenuProps {
    record: ConsumptionRecord

    /**
     * Sempre o propertyId ROOT — independente do target real do registro.
     * O backend exige isso na rota de delete (`/properties/:pid/consumption/:id`),
     * mesmo quando o registro pertence a área ou dispositivo.
     *
     * Para registros de área/device, `record.propertyId` é null — por isso
     * recebemos o id como prop separada (vem do parent, que conhece o contexto).
     */
    propertyId: string

    /**
     * Callback chamado quando o usuário clica em "Editar". O parent é
     * responsável por abrir o ConsumptionFormDialog em modo edit com este
     * registro. Quando undefined, o item de menu não é renderizado.
     */
    onEdit?: () => void

    /**
     * Callback opcional após delete bem-sucedido. Mesmo padrão dos demais
     * menus do projeto (DeviceMenu, AreaMenu).
     */
    onAfterDelete?: () => void

    /**
     * Permite ocultar o item "Editar" sem afetar "Excluir" — espelha a
     * convenção dos outros menus. No PR2 não há caso de uso real (sempre
     * ambos visíveis), mas mantemos a flag pra consistência.
     *
     * Default: true.
     */
    showEdit?: boolean
}

/**
 * Menu de ações (⋯) numa linha da tabela de consumo.
 *
 * Composição:
 *   - Trigger button (ícone MoreHorizontal) com aria-label dinâmico
 *   - Dropdown `absolute` com itens "Editar" / "Excluir"
 *   - ConfirmDialog para confirmação de exclusão
 *
 * Decisões:
 *
 * 1. `e.stopPropagation()` no click do trigger:
 *    Mesmo padrão de outros menus do projeto. A linha da tabela pode (no
 *    futuro) ter um onClick (ex: abrir detalhes inline). O trigger não
 *    deve disparar esse onClick por baixo.
 *
 * 2. Click outside fecha o menu:
 *    `useEffect` registra listener em `mousedown` quando `isMenuOpen=true`,
 *    remove no cleanup. Mais leve que registrar/remover ao mount.
 *
 * 3. `aria-label` dinâmico:
 *    "Opções do registro de DD/MM/AAAA" — segue convenção do projeto
 *    (`Opções de ${entity.name}`). Como registros não têm name, usamos a
 *    data formatada que é a referência mais legível pro usuário.
 *
 * 4. Toast de erro de delete fica AQUI (não no hook):
 *    Mesmo padrão dos outros entities — o hook só faz toast de sucesso,
 *    o consumer (este componente) faz toast de erro com mensagem contextual.
 */
export const ConsumptionRowMenu = ({
    record,
    propertyId,
    onEdit,
    onAfterDelete,
    showEdit = true,
}: ConsumptionRowMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const deleteMutation = useDeleteConsumption()

    // Click outside fecha o menu
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
                propertyId,
                id: record.id,
            })
            setIsConfirmOpen(false)
            onAfterDelete?.()
        } catch (error) {
            // Toast de sucesso vem do hook. Aqui só erro.
            toast.error("Erro ao excluir registro", {
                description: extractErrorMessage(error),
            })
        }
    }

    const formattedDate = formatReferenceDate(
        record.referenceDate,
        record.period,
    )
    const triggerAriaLabel = `Opções do registro de ${formattedDate}`

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
                data-testid={`consumption-row-${record.id}-menu-trigger`}
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
                    data-testid={`consumption-row-${record.id}-menu`}
                    className={cn(
                        "absolute right-0 top-full z-20 mt-1 w-40",
                        "overflow-hidden rounded-md border bg-white shadow-lg",
                        "border-slate-200 dark:border-slate-700 dark:bg-slate-800",
                    )}
                >
                    {showEdit && onEdit && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleEditClick}
                            data-testid={`consumption-row-${record.id}-menu-edit`}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                                "text-slate-700 hover:bg-slate-50",
                                "dark:text-slate-200 dark:hover:bg-slate-700",
                                "focus-visible:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-slate-700",
                            )}
                        >
                            <Pencil
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                            Editar
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleDeleteClick}
                        data-testid={`consumption-row-${record.id}-menu-delete`}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                            "text-red-600 hover:bg-red-50",
                            "dark:text-red-400 dark:hover:bg-red-950/30",
                            "focus-visible:outline-none focus-visible:bg-red-50 dark:focus-visible:bg-red-950/30",
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
                title="Excluir registro de consumo?"
                description={`O registro de ${formattedDate} será excluído permanentemente. Essa ação não pode ser desfeita.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
                variant="danger"
            />
        </div>
    )
}