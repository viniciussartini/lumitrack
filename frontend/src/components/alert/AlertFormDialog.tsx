import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { toast } from "sonner"
import { AlertForm } from "@/components/alert/AlertForm"
import { useCreateAlert, useUpdateAlert } from "@/hooks/queries/useAlertMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { AlertFormData } from "@/schemas/alert.schema"
import type { AlertWithStatus, CreateAlertInput, UpdateAlertInput } from "@/types/alert.types"
import type { Meter } from "@/types/meter.types"

type DialogMode = { kind: "create" } | { kind: "edit"; alert: AlertWithStatus }

interface AlertFormDialogProps {
    isOpen: boolean
    onClose: () => void
    meters: Meter[]
    mode: DialogMode
}

/**
 * Dialog (Radix) que envolve o AlertForm e orquestra create/update.
 * Mesmo padrão de `MeterFormDialog`/`ConsumptionFormDialog` (antigo): o
 * form é puro, o dialog escolhe a mutation e traduz erro pra toast.
 */
export const AlertFormDialog = ({ isOpen, onClose, meters, mode }: AlertFormDialogProps) => {
    const createAlert = useCreateAlert()
    const updateAlert = useUpdateAlert()

    const handleSubmit = async (data: AlertFormData) => {
        if (mode.kind === "create") {
            const input: CreateAlertInput = {
                name: data.name,
                meterId: data.meterId,
                referencePowerKw: data.referencePowerKw,
                tolerancePercent: data.tolerancePercent,
                enabled: data.enabled,
            }

            try {
                await createAlert.mutateAsync(input)
                onClose()
            } catch (error) {
                toast.error("Erro ao criar alerta", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input: UpdateAlertInput = {
            name: data.name,
            referencePowerKw: data.referencePowerKw,
            tolerancePercent: data.tolerancePercent,
            enabled: data.enabled,
        }

        try {
            await updateAlert.mutateAsync({ id: mode.alert.id, input })
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
                                {mode.kind === "create" ? "Criar alerta" : "Editar alerta"}
                            </Dialog.Title>
                            <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {mode.kind === "create"
                                    ? "Monitore uma faixa de potência de um medidor e seja avisado quando ela sair do esperado."
                                    : "Atualize a faixa monitorada ou desabilite o alerta."}
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
                            initialData={mode.kind === "edit" ? mode.alert : undefined}
                            meters={meters}
                            onSubmit={handleSubmit}
                            onCancel={onClose}
                            submitLabel={mode.kind === "create" ? "Criar alerta" : "Salvar alterações"}
                        />
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
