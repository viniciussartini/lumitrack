import type { ReactNode } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { AreaForm } from "@/components/area/AreaForm"
import { UnavailableDialogBody } from "@/components/ui/UnavailableDialogBody"
import { useCreateArea, useUpdateArea } from "@/hooks/queries/useAreaMutations"
import { extractErrorMessage } from "@/services/api"
import type { AreaFormData } from "@/schemas/area.schema"
import type { Area, CreateAreaInput } from "@/types/area.types"

type DialogMode =
    { kind: "create"; propertyId: string } | { kind: "edit"; propertyId: string; area: Area }

interface AreaFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
    /** Campo exibido acima do formulário — o seletor de propriedade quando o
     * modal é aberto fora do contexto de uma propriedade. */
    parentField?: ReactNode
    /** Quando presente, substitui o formulário por esta explicação (com um
     * botão Fechar) — não há propriedade onde criar a área. */
    unavailableMessage?: string
}

/** Body de criação e de atualização: a descrição só entra quando preenchida. */
const toAreaInput = (data: AreaFormData): CreateAreaInput => ({
    name: data.name,
    ...(data.description !== undefined && { description: data.description }),
})

/** Textos do modal por modo: criar ou editar. */
const DIALOG_COPY = {
    create: { kicker: "Nova área", title: "Adicionar área", submitLabel: "Criar área" },
    edit: { kicker: "Editar área", title: "Editar área", submitLabel: "Salvar área" },
} as const

/** Envio do formulário: cria ou atualiza conforme o modo; fecha o modal no sucesso e avisa no erro. */
const useAreaSubmit = (mode: DialogMode, onClose: () => void) => {
    const createArea = useCreateArea()
    const updateArea = useUpdateArea()

    const handleSubmit = async (data: AreaFormData) => {
        if (mode.kind === "create") {
            const input = toAreaInput(data)

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

        const input = toAreaInput(data)

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

    return handleSubmit
}

/**
 * Dialog (Radix, via FormDialog) que envolve o AreaForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog/PropertyFormDialog.
 * Textos do protótipo (LumiTrack Home.dc.html): criar → "Nova área" /
 * "Adicionar área" / "Criar área"; editar → "Editar área" / "Editar área" /
 * "Salvar área".
 */
export const AreaFormDialog = ({
    isOpen,
    onClose,
    mode,
    parentField,
    unavailableMessage,
}: AreaFormDialogProps) => {
    const handleSubmit = useAreaSubmit(mode, onClose)

    const copy = DIALOG_COPY[mode.kind]

    return (
        <FormDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            kicker={copy.kicker}
            title={copy.title}
        >
            {unavailableMessage ? (
                <UnavailableDialogBody message={unavailableMessage} onClose={onClose} />
            ) : (
                <div className="flex flex-col gap-4">
                    {parentField}
                    <AreaForm
                        initialData={mode.kind === "edit" ? mode.area : undefined}
                        onSubmit={handleSubmit}
                        onCancel={onClose}
                        submitLabel={copy.submitLabel}
                    />
                </div>
            )}
        </FormDialog>
    )
}
