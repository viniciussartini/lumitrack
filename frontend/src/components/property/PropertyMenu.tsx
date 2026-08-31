import { useRef, useState } from "react"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteProperty } from "@/hooks/queries/usePropertyMutations"
import { extractErrorMessage } from "@/services/api"
import type { Property } from "@/types/property.types"
import { cn } from "@/lib/cn"

interface PropertyMenuProps {
    property: Property
    /**
     * Se true (default), o menu mostra o item "Editar" antes de "Excluir".
     *
     * - PropertyCard (lista) usa true: dá um atalho rápido pra editar
     *   sem passar pela tela de detalhes.
     * - PropertyDetailsPage usa false: já tem um botão "Editar propriedade"
     *   explícito no header da página, então repetir no menu seria redundante.
     */
    showEdit?: boolean
    /**
     * Callback que abre o modal de edição (PropertyFormDialog, no card
     * chamador). O item "Editar" só é renderizado quando showEdit E onEdit
     * estão presentes — sem onEdit, o item some (fail-safe) em vez de virar
     * link morto apontando pra uma rota removida.
     */
    onEdit?: () => void
    /**
     * Callback opcional disparado após exclusão bem-sucedida.
     *
     * Quando o menu é usado na PropertyDetailsPage, depois
     * do delete a URL aponta pra uma propriedade que não existe mais — o
     * componente precisa ser informado pra navegar. No PropertyCard (lista),
     * a invalidate da query já remove o card naturalmente, então essa prop
     * não é necessária e fica como undefined.
     */
    onAfterDelete?: () => void
}

/**
 * Menu de ações por propriedade — fica no canto superior direito do card
 * ou no header da página de detalhes.
 *
 * Itens:
 *   - Editar (opcional) — chama onEdit (abre PropertyFormDialog no chamador)
 *   - Excluir — abre ConfirmDialog antes de disparar a mutation
 *
 * Diferente de DistributorMenu: Property não tem regra de "tem dependências"
 * que bloqueia o delete (Areas/Devices vinculados são apagados em cascade
 * pelo backend). Por isso o tratamento de erro é genérico — toast com a
 * mensagem do servidor.
 */
export const PropertyMenu = ({
    property,
    showEdit = true,
    onEdit,
    onAfterDelete,
}: PropertyMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const deleteMutation = useDeleteProperty()

    useClickOutside(containerRef, () => setIsMenuOpen(false))

    const handleDeleteClick = (e: React.MouseEvent) => {
        // Sem stopPropagation, o evento bolha pro Link envolvente do card
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen(false)
        setIsConfirmOpen(true)
    }

    const handleConfirmDelete = () => {
        deleteMutation.mutate(property.id, {
            onSuccess: () => {
                setIsConfirmOpen(false)
                onAfterDelete?.()
            },
            onError: (error) => {
                toast.error("Erro ao excluir", {
                    description: extractErrorMessage(error),
                })
                setIsConfirmOpen(false)
            },
        })
    }

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen((prev) => !prev)
    }

    const handleEditClick = () => {
        setIsMenuOpen(false)
        onEdit?.()
    }

    return (
        <>
            <div ref={containerRef} className="relative">
                <button
                    type="button"
                    onClick={handleTriggerClick}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-label={`Opções de ${property.name}`}
                    className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        "text-muted hover:bg-accent/7 hover:text-text",
                    )}
                >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {isMenuOpen && (
                    <div
                        role="menu"
                        aria-label="Ações"
                        className="lt-menu top-full right-0 mt-1 w-44"
                    >
                        {showEdit && onEdit && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleEditClick}
                                className="lt-menu-item border-t-0"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                Editar
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleDeleteClick}
                            className={cn(
                                "lt-menu-item lt-menu-item-danger",
                                !(showEdit && onEdit) && "border-t-0",
                            )}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Excluir
                        </button>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title="Excluir propriedade"
                description={`Tem certeza que deseja excluir "${property.name}"? Esta ação não pode ser desfeita e também removerá áreas e dispositivos vinculados.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
            />
        </>
    )
}
