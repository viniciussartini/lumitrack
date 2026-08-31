import { useRef, useState } from "react"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteArea } from "@/hooks/queries/useAreaMutations"
import { extractErrorMessage } from "@/services/api"
import type { Area } from "@/types/area.types"
import { cn } from "@/lib/cn"

interface AreaMenuProps {
    area: Area
    /**
     * Se true (default), o menu mostra o item "Editar" antes de "Excluir".
     *
     * - AreaCard (lista) usa true: dá um atalho rápido pra editar sem passar
     *   pela tela de detalhes.
     * - AreaDetailsPage usa false: o header da página já tem um botão
     *   "Editar área" explícito, então repetir no menu seria redundante.
     */
    showEdit?: boolean
    /**
     * Callback que abre o modal de edição (AreaFormDialog, no card
     * chamador). O item "Editar" só é renderizado quando showEdit E onEdit
     * estão presentes — sem onEdit, o item some (fail-safe) em vez de virar
     * link morto apontando pra uma rota removida.
     */
    onEdit?: () => void
    /**
     * Callback opcional disparado após exclusão bem-sucedida.
     *
     * Quando o menu é usado na AreaDetailsPage, depois do delete a URL
     * aponta pra uma área que não existe mais — o componente precisa ser
     * informado pra navegar de volta pra propriedade pai. No AreaCard
     * (lista), a invalidate da query já remove o card naturalmente, então
     * essa prop não é necessária e fica como undefined.
     */
    onAfterDelete?: () => void
}

/**
 * Menu de ações por área — fica no canto superior direito do card ou no
 * header da página de detalhes.
 *
 * Itens:
 *   - Editar (opcional) — chama onEdit (abre AreaFormDialog no chamador)
 *   - Excluir — abre ConfirmDialog antes de disparar a mutation
 *
 * Sobre o aria-label dinâmico:
 *   Inclui o nome da área (`Opções de ${area.name}`) — mesmo padrão do
 *   PropertyMenu. Quando há múltiplos cards na mesma página, isso permite
 *   distinguir um menu do outro pelo screen reader e em testes E2E sem
 *   precisar de `.first()` / `.nth()`.
 *
 * Sobre o aviso de cascade no ConfirmDialog:
 *   O backend tem ON DELETE CASCADE em devices, consumption_records e
 *   alerts vinculados à área. O texto avisa explicitamente sobre os 3 —
 *   é a única chance do usuário ver o impacto antes de confirmar (não há
 *   endpoint de contagem que justifique tornar o aviso condicional).
 */
export const AreaMenu = ({ area, showEdit = true, onEdit, onAfterDelete }: AreaMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const deleteMutation = useDeleteArea()

    useClickOutside(containerRef, () => setIsMenuOpen(false))

    const handleDeleteClick = (e: React.MouseEvent) => {
        // Sem stopPropagation, o evento bolha pro Link envolvente do card
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen(false)
        setIsConfirmOpen(true)
    }

    const handleConfirmDelete = () => {
        deleteMutation.mutate(
            { propertyId: area.propertyId, areaId: area.id },
            {
                onSuccess: () => {
                    setIsConfirmOpen(false)
                    onAfterDelete?.()
                },
                onError: (error) => {
                    toast.error("Erro ao excluir área", {
                        description: extractErrorMessage(error),
                    })
                },
            },
        )
    }

    const handleToggle = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen((prev) => !prev)
    }

    return (
        <>
            <div
                ref={containerRef}
                className="absolute top-2 right-2 z-10"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={handleToggle}
                    aria-label={`Opções de ${area.name}`}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                    className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md",
                        "text-muted hover:bg-accent/7 hover:text-text",
                    )}
                >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {isMenuOpen && (
                    <div role="menu" className="lt-menu top-full right-0 mt-1 w-40 overflow-hidden">
                        {showEdit && onEdit && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsMenuOpen(false)
                                    onEdit()
                                }}
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
                title="Excluir área"
                description={`Tem certeza que deseja excluir "${area.name}"? Esta ação não pode ser desfeita e também removerá todos os dispositivos, registros de consumo e alertas vinculados.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
            />
        </>
    )
}
