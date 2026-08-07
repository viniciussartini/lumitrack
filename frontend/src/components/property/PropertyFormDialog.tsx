import { Link } from "react-router"
import { Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
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
    /**
     * Só relevante no modo "create" — enquanto a query de distribuidoras da
     * página chamadora ainda não resolveu, `distributors` chega vazio por
     * estar carregando, não por estar vazio de verdade. Sem essa distinção,
     * o guard de catálogo vazio (abaixo) apareceria num falso-positivo se o
     * usuário abrir o modal antes da query resolver. Default `false` — os
     * demais consumidores (edição) nunca usam o branch que depende disso.
     */
    isDistributorsLoading?: boolean
}

/**
 * Dialog (Radix, via FormDialog) que envolve o PropertyForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog: o form é puro, o dialog
 * resolve qual mutation chamar e traduz erro pra toast.
 *
 * O protótipo (LumiTrack Home.dc.html) só especifica o modo "editar" pra
 * propriedade — o modo "criar" segue o mesmo padrão de texto que ele usa
 * pra Área/Dispositivo (kicker "Nova X" / título "Adicionar X" / "Criar X").
 *
 * Toda propriedade precisa de uma distribuidora vinculada — sem nenhuma
 * cadastrada no catálogo, o form (modo "create") não renderiza; mostra um
 * guard orientando a cadastrar uma primeiro. Texto recuperado literalmente
 * da antiga `NewPropertyPage` (removida quando a criação virou
 * modal — o guard tinha ficado pra trás). Não é o
 * `EmptyState` genérico porque ele vem com o próprio frame `.blueprint` +
 * cantos — duplicaria a moldura do modal, que já é `.blueprint`.
 */
export const PropertyFormDialog = ({
    isOpen,
    onClose,
    mode,
    distributors,
    isDistributorsLoading = false,
}: PropertyFormDialogProps) => {
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

    const isLoadingCatalog = mode.kind === "create" && isDistributorsLoading
    const isCreatingWithoutCatalog =
        mode.kind === "create" && !isDistributorsLoading && distributors.length === 0
    const showForm = !isLoadingCatalog && !isCreatingWithoutCatalog

    return (
        <FormDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            kicker={mode.kind === "create" ? "Nova propriedade" : "Propriedade"}
            title={mode.kind === "create" ? "Adicionar propriedade" : "Editar propriedade"}
        >
            {isLoadingCatalog && (
                <div
                    className="flex justify-center py-10"
                    aria-busy="true"
                    aria-label="Carregando distribuidoras"
                >
                    <div className="bg-divider h-6 w-48 animate-pulse" />
                </div>
            )}

            {isCreatingWithoutCatalog && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="border-divider flex h-14 w-14 items-center justify-center border">
                        <Zap className="text-muted h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3 className="text-lg">Catálogo de distribuidoras indisponível</h3>
                        <p className="text-muted max-w-md text-sm">
                            Toda propriedade precisa estar vinculada a uma distribuidora do
                            catálogo. Tente novamente em instantes.
                        </p>
                    </div>
                    <Button asChild variant="secondary" className="mt-2">
                        <Link to="/distribuidoras">Ver catálogo de distribuidoras</Link>
                    </Button>
                </div>
            )}

            {showForm && (
                <PropertyForm
                    initialData={mode.kind === "edit" ? mode.property : undefined}
                    distributors={distributors}
                    onSubmit={handleSubmit}
                    onCancel={onClose}
                    submitLabel={mode.kind === "create" ? "Criar propriedade" : "Salvar alterações"}
                />
            )}
        </FormDialog>
    )
}
