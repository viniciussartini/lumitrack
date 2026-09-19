import { useState, type ReactNode } from "react"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { Select } from "@/components/ui/Select"
import { useAreasByProperties, type PropertyAreas } from "@/hooks/queries/useAreasByProperties"
import type { Property } from "@/types/property.types"

interface DeviceCreateDialogProps {
    isOpen: boolean
    onClose: () => void
    /** Propriedades cujas áreas o usuário pode escolher. */
    properties: readonly Property[]
}

interface AreaOption {
    propertyId: string
    areaId: string
}

const findSelected = (groups: readonly PropertyAreas[], areaId: string): AreaOption | undefined => {
    const options = groups.flatMap(({ property, areas }) =>
        areas.map((area) => ({ propertyId: property.id, areaId: area.id })),
    )
    return options.find((option) => option.areaId === areaId) ?? options[0]
}

const UnavailableMessage = ({ children, role }: { children: ReactNode; role?: "alert" }) => (
    <p
        role={role}
        className={role === "alert" ? "text-status-danger text-sm" : "text-muted text-sm"}
    >
        {children}
    </p>
)

/**
 * Criação de dispositivo fora do contexto de uma área (Configurações →
 * Cadastro): o modal traz um seletor "Área" agrupado por propriedade — o grupo
 * diz de qual propriedade a área é —, com a primeira área pré-selecionada. As
 * áreas só são buscadas com o modal aberto. Carregando, com erro ou sem
 * nenhuma área, o formulário não é oferecido: não há onde criar o dispositivo.
 */
export const DeviceCreateDialog = ({ isOpen, onClose, properties }: DeviceCreateDialogProps) => {
    const { groups, isLoading, isError } = useAreasByProperties(properties, isOpen)
    const [chosenAreaId, setChosenAreaId] = useState("")

    if (!isOpen && chosenAreaId !== "") setChosenAreaId("")

    const selected = findSelected(groups, chosenAreaId)

    let unavailable: ReactNode
    if (isError) {
        unavailable = (
            <UnavailableMessage role="alert">
                Não foi possível carregar as áreas. Feche e tente novamente.
            </UnavailableMessage>
        )
    } else if (isLoading) {
        unavailable = <UnavailableMessage>Carregando áreas…</UnavailableMessage>
    } else if (!selected) {
        unavailable = (
            <UnavailableMessage>
                Nenhuma área cadastrada. Crie uma área primeiro para poder adicionar dispositivos.
            </UnavailableMessage>
        )
    }

    return (
        <DeviceFormDialog
            isOpen={isOpen}
            onClose={onClose}
            mode={{
                kind: "create",
                propertyId: selected?.propertyId ?? "",
                areaId: selected?.areaId ?? "",
            }}
            unavailable={unavailable}
            parentField={
                <Select
                    label="Área"
                    value={selected?.areaId ?? ""}
                    onChange={(event) => setChosenAreaId(event.target.value)}
                >
                    {groups
                        .filter(({ areas }) => areas.length > 0)
                        .map(({ property, areas }) => (
                            <optgroup key={property.id} label={property.name}>
                                {areas.map((area) => (
                                    <option key={area.id} value={area.id}>
                                        {area.name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                </Select>
            }
        />
    )
}
