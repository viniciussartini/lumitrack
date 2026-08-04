import { useEffect, useState } from "react"
import { storage, STORAGE_KEYS } from "@/lib/storage"
import type { Property } from "@/types/property.types"

interface UsePropertySelectionResult {
    selectedId: string | null
    selectedProperty: Property | undefined
    selectProperty: (id: string) => void
}

/**
 * Seleção de propriedade ativa do Painel. Não busca dados própria — recebe
 * a lista já carregada por quem chama (DashboardPage). Persiste em
 * localStorage (não em Context) para sobreviver à desmontagem da página ao
 * trocar de rota, já que hoje só o Painel consome essa seleção.
 */
export const usePropertySelection = (
    properties: Property[] | undefined,
): UsePropertySelectionResult => {
    const [manualId, setManualId] = useState<string | null>(() =>
        storage.get(STORAGE_KEYS.SELECTED_PROPERTY),
    )

    // Deriva a seleção efetiva no corpo do render (sem setState em efeito,
    // que causaria um flash de "nada selecionado" até o próximo render):
    // se `manualId` não existe mais na lista (nunca setado, ou propriedade
    // removida), cai pra primeira da lista.
    const resolvedId = properties?.some((p) => p.id === manualId)
        ? manualId
        : (properties?.[0]?.id ?? null)

    useEffect(() => {
        if (!properties) return
        if (resolvedId === manualId) return

        if (resolvedId) storage.set(STORAGE_KEYS.SELECTED_PROPERTY, resolvedId)
        else storage.remove(STORAGE_KEYS.SELECTED_PROPERTY)
    }, [properties, manualId, resolvedId])

    const selectProperty = (id: string): void => {
        setManualId(id)
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, id)
    }

    const selectedProperty = properties?.find((p) => p.id === resolvedId)

    return { selectedId: resolvedId, selectedProperty, selectProperty }
}
