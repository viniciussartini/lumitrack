import { useRef, useState } from "react"
import { useParams } from "react-router"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteDevice } from "@/hooks/queries/useDeviceMutations"
import { extractErrorMessage } from "@/services/api"
import type { Device } from "@/types/device.types"
import { cn } from "@/lib/cn"

interface DeviceMenuProps {
    device: Device
    /**
     * Se true (default), o menu mostra o item "Editar" antes de "Excluir".
     *
     * - DeviceCard (lista) usa true: dá um atalho rápido pra editar sem
     *   passar pela tela de detalhes.
     * - DeviceDetailsPage usa false: o header da página já tem um botão
     *   "Editar dispositivo" explícito, então repetir no menu seria
     *   redundante.
     */
    showEdit?: boolean
    /**
     * Callback que abre o modal de edição (DeviceFormDialog, no card
     * chamador). O item "Editar" só é renderizado quando showEdit E onEdit
     * estão presentes — sem onEdit, o item some (fail-safe) em vez de virar
     * link morto (antes de #98, apontava pra rota removida em #97).
     */
    onEdit?: () => void
    /**
     * Callback opcional disparado após exclusão bem-sucedida.
     *
     * Quando o menu é usado na DeviceDetailsPage, depois do delete a URL
     * aponta pra um device que não existe mais — o componente precisa ser
     * informado pra navegar de volta pra área pai. No DeviceCard (lista),
     * a invalidate da query já remove o card naturalmente, então essa
     * prop não é necessária e fica como undefined.
     */
    onAfterDelete?: () => void
}

/**
 * Menu de ações por dispositivo — fica no canto superior direito do card
 * ou no header da página de detalhes.
 *
 * Itens:
 *   - Editar (opcional) — chama onEdit (abre DeviceFormDialog no chamador)
 *   - Excluir — abre ConfirmDialog antes de disparar a mutation
 *
 *   O Device só sabe o areaId — não tem propertyId no objeto. Mas a
 *   mutation de exclusão precisa do propertyId. Pegamos via useParams
 *   da rota envolvente (este menu só renderiza dentro de AreaDetailsPage
 *   ou DeviceDetailsPage, ambas com :propertyId no path).
 *
 * Sobre o aviso de cascade no ConfirmDialog:
 *   O backend tem ON DELETE CASCADE em consumption_records, alerts e
 *   iot_device_configs vinculados ao device. O texto avisa explicitamente
 *   sobre os 3 — é a única chance do usuário ver o impacto antes de
 *   confirmar (não há endpoint de contagem que justifique tornar o aviso
 *   condicional).
 */
export const DeviceMenu = ({ device, showEdit = true, onEdit, onAfterDelete }: DeviceMenuProps) => {
    const { propertyId } = useParams<{ propertyId: string }>()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const deleteMutation = useDeleteDevice()

    useClickOutside(containerRef, () => setIsMenuOpen(false))

    const handleDeleteClick = (e: React.MouseEvent) => {
        // Sem stopPropagation, o evento bolha pro Link envolvente do card
        e.preventDefault()
        e.stopPropagation()
        setIsMenuOpen(false)
        setIsConfirmOpen(true)
    }

    const handleConfirmDelete = () => {
        if (!propertyId) return
        deleteMutation.mutate(
            {
                propertyId,
                areaId: device.areaId,
                deviceId: device.id,
            },
            {
                onSuccess: () => {
                    setIsConfirmOpen(false)
                    onAfterDelete?.()
                },
                onError: (error) => {
                    toast.error("Erro ao excluir dispositivo", {
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
                    aria-label={`Opções de ${device.name}`}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                    className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md",
                        "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                        "focus:ring-brand-500 focus:ring-2 focus:outline-none",
                    )}
                >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {isMenuOpen && (
                    <div
                        role="menu"
                        className={cn(
                            "absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border bg-white shadow-lg",
                            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        )}
                    >
                        {showEdit && onEdit && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsMenuOpen(false)
                                    onEdit()
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                    "text-slate-700 hover:bg-slate-50",
                                    "dark:text-slate-200 dark:hover:bg-slate-800",
                                )}
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
                title="Excluir dispositivo"
                description={`Tem certeza que deseja excluir "${device.name}"? Esta ação não pode ser desfeita e também removerá todos os registros de consumo, alertas e configurações de integração IoT vinculados.`}
                confirmLabel="Excluir"
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
            />
        </>
    )
}
