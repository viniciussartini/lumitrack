import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { toast } from "sonner"
import { AlertForm } from "@/components/alert/AlertForm"
import {
    useCreateAlertForArea,
    useCreateAlertForDevice,
    useCreateAlertForProperty,
    useUpdateAlert,
} from "@/hooks/queries/useAlertMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { AlertFormData } from "@/schemas/alert.schema"
import type {
    Alert,
    AlertFormTarget,
    CreateAlertInput,
    UpdateAlertInput,
} from "@/types/alert.types"

type DialogMode =
    | { kind: "create" }
    | { kind: "edit"; alert: Alert }

interface AlertFormDialogProps {
    isOpen: boolean
    onClose: () => void
    target: AlertFormTarget
    mode: DialogMode
}

/**
 * Dialog (Radix) que envolve o AlertForm e orquestra a mutation apropriada
 * baseada em (target × mode).
 *
 * Form vs FormDialog (mesmo padrão do consumption):
 *   - AlertForm é PURO (RHF + UI). Não conhece mutations nem toasts.
 *   - AlertFormDialog faz orquestração: escolhe a mutation certa (por
 *     target em CREATE; única em EDIT), fecha em sucesso, traduz erro
 *     pra toast.
 *
 * Por que mode é discriminated union em vez de duas props:
 *   - Garantia em compile-time de que `alert` existe quando estamos em
 *     edit. Sem isso, teríamos `alert?` opcional e if/else runtime para
 *     cada acesso.
 *
 * Por que target é separado de mode:
 *   - target descreve ONDE o alerta vive (qual entity). É necessário tanto
 *     em CREATE quanto em EDIT (em EDIT só pra contexto visual no header).
 *     Não muda entre kinds.
 *
 * Sobre erros (mesma decisão do consumption — toast genérico):
 *   - Erros 4xx/5xx caem no try/catch e viram toast.error com mensagem
 *     do extractErrorMessage. Backend já entrega mensagens humanas.
 *   - Dialog NÃO fecha em erro — usuário pode corrigir e tentar de novo
 *     sem ter que reabrir e reescrever tudo.
 */
export const AlertFormDialog = ({
    isOpen,
    onClose,
    target,
    mode,
}: AlertFormDialogProps) => {
    const createProperty = useCreateAlertForProperty()
    const createArea = useCreateAlertForArea()
    const createDevice = useCreateAlertForDevice()
    const update = useUpdateAlert()

    const handleSubmit = async (data: AlertFormData) => {
        if (mode.kind === "create") {
            await handleCreate(data)
        } else {
            await handleEdit(data, mode.alert)
        }
    }

    const handleCreate = async (data: AlertFormData) => {
        // Constrói o input — message só vai pro payload se foi preenchida
        const input: CreateAlertInput = {
            thresholdKwh: data.thresholdKwh,
            ...(data.message !== undefined && { message: data.message }),
        }

        try {
            if (target.type === "property") {
                await createProperty.mutateAsync({
                    propertyId: target.propertyId,
                    input,
                })
            } else if (target.type === "area") {
                await createArea.mutateAsync({
                    propertyId: target.propertyId,
                    areaId: target.areaId,
                    input,
                })
            } else {
                await createDevice.mutateAsync({
                    propertyId: target.propertyId,
                    areaId: target.areaId,
                    deviceId: target.deviceId,
                    input,
                })
            }
            onClose()
        } catch (error) {
            // Toast de sucesso vem do hook. Aqui só erro.
            toast.error("Erro ao criar alerta", {
                description: extractErrorMessage(error),
            })
        }
    }

    const handleEdit = async (data: AlertFormData, alert: Alert) => {
        const input: UpdateAlertInput = {
            thresholdKwh: data.thresholdKwh,
            ...(data.message !== undefined && { message: data.message }),
        }

        try {
            await update.mutateAsync({ id: alert.id, input })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar alerta", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        "fixed inset-0 z-40 bg-black/50",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    )}
                />
                <Dialog.Content
                    data-testid="alert-form-dialog"
                    className={cn(
                        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
                        "rounded-lg border bg-white p-6 shadow-lg",
                        "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                {mode.kind === "create"
                                    ? "Criar alerta"
                                    : "Editar alerta"}
                            </Dialog.Title>
                            <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {mode.kind === "create"
                                    ? "Defina um limite (kWh) para ser notificado quando o consumo ultrapassar."
                                    : "Atualize o limite ou a mensagem do alerta."}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            className={cn(
                                "rounded-md p-1 text-slate-500",
                                "hover:bg-slate-100 hover:text-slate-700",
                                "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                                "focus:outline-none focus:ring-2 focus:ring-brand-500",
                            )}
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    <div className="mt-4">
                        <AlertForm
                            initialData={
                                mode.kind === "edit" ? mode.alert : undefined
                            }
                            onSubmit={handleSubmit}
                            onCancel={onClose}
                            submitLabel={
                                mode.kind === "create"
                                    ? "Criar alerta"
                                    : "Salvar alterações"
                            }
                        />
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}