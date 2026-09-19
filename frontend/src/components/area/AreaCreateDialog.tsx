import { useState } from "react"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { Select } from "@/components/ui/Select"
import type { Property } from "@/types/property.types"

interface AreaCreateDialogProps {
    isOpen: boolean
    onClose: () => void
    /** Propriedades entre as quais o usuário escolhe onde criar a área. */
    properties: readonly Property[]
}

/**
 * Criação de área fora do contexto de uma propriedade (Configurações →
 * Cadastro): o modal traz o seletor de propriedade como primeiro campo, com a
 * primeira propriedade pré-selecionada. A escolha volta ao padrão sempre que
 * o modal fecha.
 */
export const AreaCreateDialog = ({ isOpen, onClose, properties }: AreaCreateDialogProps) => {
    const [chosenId, setChosenId] = useState("")

    if (!isOpen && chosenId !== "") setChosenId("")

    const propertyId = properties.some((p) => p.id === chosenId)
        ? chosenId
        : (properties[0]?.id ?? "")

    return (
        <AreaFormDialog
            isOpen={isOpen}
            onClose={onClose}
            mode={{ kind: "create", propertyId }}
            parentField={
                <Select
                    label="Propriedade"
                    value={propertyId}
                    onChange={(event) => setChosenId(event.target.value)}
                >
                    {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                            {property.name}
                        </option>
                    ))}
                </Select>
            }
        />
    )
}
