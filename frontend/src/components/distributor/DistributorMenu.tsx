import { useRef, useState } from "react"
import { MoreVertical, Trash2 } from "lucide-react"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteDistributor } from "@/hooks/queries/useDistributorMutations"
import type { Distributor } from "@/types/distributor.types"
import { cn } from "@/lib/cn"
import { toast } from "sonner"
import { extractErrorMessage } from "@/services/api"

interface DistributorMenuProps {
    distributor: Distributor
}

/**
 * Menu de ações por distribuidora — fica no canto superior direito do card.
 *
 * Edição não está aqui: clicar no card todo já leva pra página de edição.
 *
 * Exclusão abre ConfirmDialog antes de disparar a mutation.
 *
 * Trata o erro 4xx do backend ("distribuidora possui propriedades vinculadas")
 * com mensagem específica em vez do erro cru do servidor.
 */
export const DistributorMenu = ({ distributor }: DistributorMenuProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const deleteMutation = useDeleteDistributor()

    useClickOutside(containerRef, () => setIsMenuOpen(false))

    const handleDeleteClick = (e: React.MouseEvent) => {
        // Sem stopPropagation, o evento bolha pro Link envolvente do card
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen(false)
        setIsConfirmOpen(true)
    }

    const handleConfirmDelete = () => {
        deleteMutation.mutate(distributor.id, {
            onSuccess: () => {
                setIsConfirmOpen(false)
            },
            onError: (error) => {
                const message = extractErrorMessage(error)
                // Backend retorna 4xx com mensagem específica
                // quando há propriedades vinculadas. Damos uma versão amigável.
                if (message.toLowerCase().includes("propriedade")) {
                    toast.error("Não é possível excluir", {
                        description:
                            "Esta distribuidora possui propriedades vinculadas. Remova as propriedades antes.",
                    })
                } else {
                    toast.error("Erro ao excluir", { description: message })
                }
                setIsConfirmOpen(false)
            },
        })
    }

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen((prev) => !prev)
    }

    return (
        <>
            <div ref={containerRef} className="relative">
                <button
                    type="button"
                    onClick={handleTriggerClick}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-label={`Opções de ${distributor.name}`}
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
                title="Excluir distribuidora"
                description={`Tem certeza que deseja excluir "${distributor.name}"? Esta ação não pode ser desfeita.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
            />
        </>
    )
}