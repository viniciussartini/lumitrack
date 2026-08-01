import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { AreaForm } from "@/components/area/AreaForm"
import { useCreateArea, useUpdateArea } from "@/hooks/queries/useAreaMutations"
import { extractErrorMessage } from "@/services/api"
import type { AreaFormData } from "@/schemas/area.schema"
import type { Area, CreateAreaInput, UpdateAreaInput } from "@/types/area.types"

type DialogMode =
    | { kind: "create"; propertyId: string }
    | { kind: "edit"; propertyId: string; area: Area }

interface AreaFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
}

/**
 * Dialog (Radix, via FormDialog) que envolve o AreaForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog/PropertyFormDialog.
 * Textos do protótipo (LumiTrack Home.dc.html): criar → "Nova área" /
 * "Adicionar área" / "Criar área"; editar → "Editar área" / "Editar área" /
 * "Salvar área".
 */
export const AreaFormDialog = ({ isOpen, onClose, mode }: AreaFormDialogProps) => {
    const createArea = useCreateArea()
    const updateArea = useUpdateArea()

    const handleSubmit = async (data: AreaFormData) => {
        if (mode.kind === "create") {
            const input: CreateAreaInput = {
                name: data.name,
                ...(data.description !== undefined && { description: data.description }),
            }

            try {
                await createArea.mutateAsync({ propertyId: mode.propertyId, input })
                onClose()
            } catch (error) {
                toast.error("Erro ao criar área", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input: UpdateAreaInput = {
            name: data.name,
            ...(data.description !== undefined && { description: data.description }),
        }

        try {
            await updateArea.mutateAsync({
                propertyId: mode.propertyId,
                areaId: mode.area.id,
                input,
            })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar área", {
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
            kicker={mode.kind === "create" ? "Nova área" : "Editar área"}
            title={mode.kind === "create" ? "Adicionar área" : "Editar área"}
        >
            <AreaForm
                initialData={mode.kind === "edit" ? mode.area : undefined}
                onSubmit={handleSubmit}
                onCancel={onClose}
                submitLabel={mode.kind === "create" ? "Criar área" : "Salvar área"}
            />
        </FormDialog>
    )
}
