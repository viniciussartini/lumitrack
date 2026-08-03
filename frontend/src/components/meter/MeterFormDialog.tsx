import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { MeterForm } from "@/components/meter/MeterForm"
import { useCreateMeter, useUpdateMeter } from "@/hooks/queries/useMeterMutations"
import { extractErrorMessage } from "@/services/api"
import type { MeterFormData } from "@/schemas/meter.schema"
import type { CreateMeterInput, Meter, TargetType, UpdateMeterInput } from "@/types/meter.types"

type DialogMode =
    | { kind: "create"; targetType: TargetType; targetId: string }
    | { kind: "edit"; meter: Meter }

interface MeterFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
}

/**
 * Dialog (Radix) que envolve o MeterForm e orquestra create/update.
 * Mesmo padrão de `AlertFormDialog`/`ConsumptionFormDialog`: o form é puro
 * (RHF + UI), o dialog resolve qual mutation chamar e traduz erro pra toast.
 */
export const MeterFormDialog = ({ isOpen, onClose, mode }: MeterFormDialogProps) => {
    const createMeter = useCreateMeter()
    const updateMeter = useUpdateMeter()

    const handleSubmit = async (data: MeterFormData) => {
        if (mode.kind === "create") {
            const targetField =
                mode.targetType === "PROPERTY"
                    ? { targetType: "PROPERTY" as const, propertyId: mode.targetId }
                    : mode.targetType === "AREA"
                    ? { targetType: "AREA" as const, areaId: mode.targetId }
                    : { targetType: "DEVICE" as const, deviceId: mode.targetId }

            const input: CreateMeterInput = {
                ...targetField,
                name: data.name,
                protocol: data.protocol,
                ...(data.host !== undefined && { host: data.host }),
                ...(data.port !== undefined && { port: data.port }),
                ...(data.topic !== undefined && { topic: data.topic }),
                ...(data.address !== undefined && { address: data.address }),
            }

            try {
                await createMeter.mutateAsync(input)
                onClose()
            } catch (error) {
                toast.error("Erro ao vincular medidor", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input: UpdateMeterInput = {
            name: data.name,
            protocol: data.protocol,
            ...(data.host !== undefined && { host: data.host }),
            ...(data.port !== undefined && { port: data.port }),
            ...(data.topic !== undefined && { topic: data.topic }),
            ...(data.address !== undefined && { address: data.address }),
        }

        try {
            await updateMeter.mutateAsync({ id: mode.meter.id, input })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar medidor", {
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
            kicker="Medidor"
            title={mode.kind === "create" ? "Configurar medidor" : "Editar medidor"}
        >
            <MeterForm
                initialData={mode.kind === "edit" ? mode.meter : undefined}
                onSubmit={handleSubmit}
                onCancel={onClose}
                submitLabel={mode.kind === "create" ? "Vincular medidor" : "Salvar alterações"}
            />
        </FormDialog>
    )
}
