import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { PropertyForm } from "@/components/property/PropertyForm"
import { useCreateProperty, useUpdateProperty } from "@/hooks/queries/usePropertyMutations"
import { extractErrorMessage } from "@/services/api"
import type { PropertyFormData } from "@/schemas/property.schema"
import type { CreatePropertyInput, Property, UpdatePropertyInput } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

type DialogMode = { kind: "create" } | { kind: "edit"; property: Property }

interface PropertyFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
    /** Catálogo de distribuidoras pro select — carregado pela página chamadora. */
    distributors: Distributor[]
}

/**
 * Dialog (Radix, via FormDialog) que envolve o PropertyForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog: o form é puro, o dialog
 * resolve qual mutation chamar e traduz erro pra toast.
 *
 * O protótipo (LumiTrack Home.dc.html) só especifica o modo "editar" pra
 * propriedade — o modo "criar" segue o mesmo padrão de texto que ele usa
 * pra Área/Dispositivo (kicker "Nova X" / título "Adicionar X" / "Criar X").
 */
export const PropertyFormDialog = ({ isOpen, onClose, mode, distributors }: PropertyFormDialogProps) => {
    const createProperty = useCreateProperty()
    const updateProperty = useUpdateProperty()

    const handleSubmit = async (data: PropertyFormData) => {
        if (mode.kind === "create") {
            const input: CreatePropertyInput = {
                distributorId: data.distributorId,
                name: data.name,
                electricalSystem: data.electricalSystem,
                billingClass: data.billingClass,
                ...(data.address !== undefined && { address: data.address }),
                ...(data.city !== undefined && { city: data.city }),
                ...(data.state !== undefined && { state: data.state }),
                ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
                ...(data.publicLightingFeeBrl !== undefined && {
                    publicLightingFeeBrl: data.publicLightingFeeBrl,
                }),
            }

            try {
                await createProperty.mutateAsync(input)
                onClose()
            } catch (error) {
                toast.error("Erro ao criar propriedade", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input: UpdatePropertyInput = {
            distributorId: data.distributorId,
            name: data.name,
            address: data.address,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
            electricalSystem: data.electricalSystem,
            billingClass: data.billingClass,
            publicLightingFeeBrl: data.publicLightingFeeBrl,
        }

        try {
            await updateProperty.mutateAsync({ id: mode.property.id, input })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar propriedade", {
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
            kicker={mode.kind === "create" ? "Nova propriedade" : "Propriedade"}
            title={mode.kind === "create" ? "Adicionar propriedade" : "Editar propriedade"}
        >
            <PropertyForm
                initialData={mode.kind === "edit" ? mode.property : undefined}
                distributors={distributors}
                onSubmit={handleSubmit}
                onCancel={onClose}
                submitLabel={mode.kind === "create" ? "Criar propriedade" : "Salvar alterações"}
            />
        </FormDialog>
    )
}
