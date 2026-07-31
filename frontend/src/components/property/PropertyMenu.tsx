import { useRef, useState } from "react"
import { Link } from "react-router"
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
 *   - Editar (opcional) — link pra /propriedades/:id/editar
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

    /**
     * Click no Link "Editar": só fecha o menu (a navegação acontece
     * naturalmente via React Router). Não precisa preventDefault — queremos
     * a navegação. Não precisa stopPropagation — o menu fica fora do Link
     * envolvente do card (em absolute positioning), então o click não bolha.
     */
    const handleEditClick = () => {
        setIsMenuOpen(false)
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
                        "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                    )}
                >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {isMenuOpen && (
                    <div
                        role="menu"
                        aria-label="Ações"
                        className={cn(
                            "absolute right-0 top-full z-10 mt-1 w-44",
                            "rounded-md border bg-white py-1 shadow-lg",
                            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        )}
                    >
                        {showEdit && (
                            <Link
                                role="menuitem"
                                to={`/propriedades/${property.id}/editar`}
                                onClick={handleEditClick}
                                className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                    "text-slate-700 hover:bg-slate-100",
                                    "dark:text-slate-200 dark:hover:bg-slate-800",
                                )}
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                Editar
                            </Link>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleDeleteClick}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                "text-red-600 hover:bg-red-50",
                                "dark:text-red-400 dark:hover:bg-red-950/50",
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