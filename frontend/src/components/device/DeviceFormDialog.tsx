import type { ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { FormDialog } from "@/components/ui/FormDialog"
import { DeviceForm } from "@/components/device/DeviceForm"
import { useCreateDevice, useUpdateDevice } from "@/hooks/queries/useDeviceMutations"
import { extractErrorMessage } from "@/services/api"
import type { DeviceFormData } from "@/schemas/device.schema"
import type { CreateDeviceInput, Device } from "@/types/device.types"

type DialogMode =
    | { kind: "create"; propertyId: string; areaId: string }
    | { kind: "edit"; propertyId: string; areaId: string; device: Device }

interface DeviceFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
    /** Campo exibido acima do formulário — o seletor de área quando o modal é
     * aberto fora do contexto de uma área. */
    parentField?: ReactNode
    /** Quando presente, substitui o formulário por este conteúdo (com um botão
     * Fechar) — carregando, erro ou nenhuma área onde criar o dispositivo. */
    unavailable?: ReactNode
}

/** Body de criação e de atualização: os opcionais só entram quando preenchidos. */
const toDeviceInput = (data: DeviceFormData): CreateDeviceInput => ({
    name: data.name,
    ...(data.brand !== undefined && { brand: data.brand }),
    ...(data.model !== undefined && { model: data.model }),
    ...(data.powerWatts !== undefined && { powerWatts: data.powerWatts }),
})

const UnavailableBody = ({ children, onClose }: { children: ReactNode; onClose: () => void }) => (
    <div className="flex flex-col gap-6">
        {children}
        <div className="border-divider flex justify-end border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
                Fechar
            </Button>
        </div>
    </div>
)

/**
 * Dialog (Radix, via FormDialog) que envolve o DeviceForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog/PropertyFormDialog/
 * AreaFormDialog. Textos do protótipo (LumiTrack Home.dc.html): criar →
 * "Novo dispositivo" / "Adicionar dispositivo" / "Criar dispositivo";
 * editar → "Editar dispositivo" / "Editar dispositivo" / "Salvar dispositivo".
 */
export const DeviceFormDialog = ({
    isOpen,
    onClose,
    mode,
    parentField,
    unavailable,
}: DeviceFormDialogProps) => {
    const createDevice = useCreateDevice()
    const updateDevice = useUpdateDevice()

    const handleSubmit = async (data: DeviceFormData) => {
        if (mode.kind === "create") {
            const input = toDeviceInput(data)

            try {
                await createDevice.mutateAsync({
                    propertyId: mode.propertyId,
                    areaId: mode.areaId,
                    input,
                })
                onClose()
            } catch (error) {
                toast.error("Erro ao criar dispositivo", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input = toDeviceInput(data)

        try {
            await updateDevice.mutateAsync({
                propertyId: mode.propertyId,
                areaId: mode.areaId,
                deviceId: mode.device.id,
                input,
            })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar dispositivo", {
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
            kicker={mode.kind === "create" ? "Novo dispositivo" : "Editar dispositivo"}
            title={mode.kind === "create" ? "Adicionar dispositivo" : "Editar dispositivo"}
        >
            {unavailable ? (
                <UnavailableBody onClose={onClose}>{unavailable}</UnavailableBody>
            ) : (
                <div className="flex flex-col gap-4">
                    {parentField}
                    <DeviceForm
                        initialData={mode.kind === "edit" ? mode.device : undefined}
                        onSubmit={handleSubmit}
                        onCancel={onClose}
                        submitLabel={
                            mode.kind === "create" ? "Criar dispositivo" : "Salvar dispositivo"
                        }
                    />
                </div>
            )}
        </FormDialog>
    )
}
