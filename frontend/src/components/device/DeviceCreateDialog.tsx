import { useState } from "react"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { Select } from "@/components/ui/Select"
import type { PropertyTreeNode } from "@/types/property.types"

interface DeviceCreateDialogProps {
    isOpen: boolean
    onClose: () => void
    /** Propriedades, já com suas áreas, entre as quais o usuário escolhe a área. */
    properties: readonly PropertyTreeNode[]
}

interface AreaOption {
    propertyId: string
    areaId: string
}

const findSelected = (
    properties: readonly PropertyTreeNode[],
    areaId: string,
): AreaOption | undefined => {
    const options = properties.flatMap((property) =>
        property.areas.map((area) => ({ propertyId: property.id, areaId: area.id })),
    )
    return options.find((option) => option.areaId === areaId) ?? options[0]
}

/**
 * Criação de dispositivo fora do contexto de uma área (Configurações →
 * Cadastro): o modal traz um seletor "Área" agrupado por propriedade — o grupo
 * diz de qual propriedade a área é —, com a primeira área pré-selecionada. As
 * áreas vêm das próprias propriedades recebidas (a árvore de cadastro já as
 * carregou), sem nova busca. Sem nenhuma área não há onde criar o
 * dispositivo: o formulário não é oferecido.
 */
export const DeviceCreateDialog = ({ isOpen, onClose, properties }: DeviceCreateDialogProps) => {
    const [chosenAreaId, setChosenAreaId] = useState("")

    if (!isOpen && chosenAreaId !== "") setChosenAreaId("")

    const selected = findSelected(properties, chosenAreaId)

    return (
        <DeviceFormDialog
            isOpen={isOpen}
            onClose={onClose}
            mode={{
                kind: "create",
                propertyId: selected?.propertyId ?? "",
                areaId: selected?.areaId ?? "",
            }}
            {...(!selected && {
                unavailableMessage:
                    "Nenhuma área cadastrada. Crie uma área primeiro para poder adicionar dispositivos.",
            })}
            parentField={
                <Select
                    label="Área"
                    value={selected?.areaId ?? ""}
                    onChange={(event) => setChosenAreaId(event.target.value)}
                >
                    {properties
                        .filter(({ areas }) => areas.length > 0)
                        .map(({ id, name, areas }) => (
                            <optgroup key={id} label={name}>
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
