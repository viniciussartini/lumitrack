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
 * trocar de rota, e é compartilhada pelas páginas que escolhem propriedade.
 *
 * `preferredId` é a propriedade pedida por quem abriu a página (um link de
 * aviso, por exemplo): vale enquanto o usuário não escolher outra e não
 * altera a propriedade guardada. Um id que não está na lista é ignorado.
 */
export const usePropertySelection = (
    properties: Property[] | undefined,
    preferredId: string | null = null,
): UsePropertySelectionResult => {
    const [manualId, setManualId] = useState<string | null>(() =>
        storage.get(STORAGE_KEYS.SELECTED_PROPERTY),
    )
    const [overridden, setOverridden] = useState(false)

    // Deriva a seleção efetiva no corpo do render (sem setState em efeito,
    // que causaria um flash de "nada selecionado" até o próximo render):
    // se `manualId` não existe mais na lista (nunca setado, ou propriedade
    // removida), cai pra primeira da lista.
    const usePreferred =
        !overridden && preferredId !== null && properties?.some((p) => p.id === preferredId)
    const resolvedId = usePreferred
        ? preferredId
        : properties?.some((p) => p.id === manualId)
          ? manualId
          : (properties?.[0]?.id ?? null)

    useEffect(() => {
        if (!properties || usePreferred) return
        if (resolvedId === manualId) return

        if (resolvedId) storage.set(STORAGE_KEYS.SELECTED_PROPERTY, resolvedId)
        else storage.remove(STORAGE_KEYS.SELECTED_PROPERTY)
    }, [properties, manualId, resolvedId, usePreferred])

    const selectProperty = (id: string): void => {
        setOverridden(true)
        setManualId(id)
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, id)
    }

    const selectedProperty = properties?.find((p) => p.id === resolvedId)

    return { selectedId: resolvedId, selectedProperty, selectProperty }
}
