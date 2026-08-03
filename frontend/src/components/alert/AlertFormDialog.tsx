import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { AlertForm } from "@/components/alert/AlertForm"
import { useCreateAlert, useUpdateAlert } from "@/hooks/queries/useAlertMutations"
import { extractErrorMessage } from "@/services/api"
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
 * Dialog (via `FormDialog`) que envolve o AlertForm e orquestra
 * create/update. Mesmo padrão de `MeterFormDialog`/`PropertyFormDialog`: o
 * form é puro, o dialog escolhe a mutation e traduz erro pra toast.
 *
 * `LumiTrack Home.dc.html` não tem um texto de apoio no header do modal de
 * alerta (só kicker + título) — por isso não há mais `Dialog.Description`
 * aqui, mesma convenção do `FormDialog` (que já silencia esse warning do
 * Radix de propósito).
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
        <FormDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            kicker={mode.kind === "create" ? "Novo alerta" : "Editar alerta"}
            title={mode.kind === "create" ? "Criar alerta" : "Editar alerta"}
        >
            <AlertForm
                initialData={mode.kind === "edit" ? mode.alert : undefined}
                meters={meters}
                onSubmit={handleSubmit}
                onCancel={onClose}
                submitLabel={mode.kind === "create" ? "Criar alerta" : "Salvar alterações"}
            />
        </FormDialog>
    )
}
