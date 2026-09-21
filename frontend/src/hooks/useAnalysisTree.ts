import { useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useLocation, useNavigate } from "react-router"
import {
    buildAnalysisTree,
    flattenVisible,
    parseAnalysisSelection,
    resolveTreeKey,
    type AnalysisNode,
} from "@/lib/analysisTree"
import type { PropertyTreeNode } from "@/types/property.types"

/** O que cada linha da árvore precisa saber, montado uma vez pelo pai. */
export interface AnalysisTreeContext {
    selectedId: string | undefined
    tabbableId: string | undefined
    isOpen: (node: AnalysisNode) => boolean
    onActivate: (node: AnalysisNode) => void
    onFocusItem: (id: string) => void
    registerItem: (id: string, element: HTMLElement | null) => void
}

/**
 * Estado da árvore de Análise: busca, expansão, foco e teclado. A seleção vem
 * da URL. Expandido = o que o usuário alternou, ou, por padrão, o caminho até
 * o item selecionado; com busca ativa, todo nó que tem resultado.
 */
export const useAnalysisTree = (properties: PropertyTreeNode[] | undefined) => {
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const selection = parseAnalysisSelection(pathname)
    const selectedId = selection.deviceId ?? selection.areaId ?? selection.propertyId

    const [query, setQuery] = useState("")
    const [toggled, setToggled] = useState<Record<string, boolean>>({})
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const items = useRef(new Map<string, HTMLElement>())

    const searching = query.trim() !== ""
    const nodes = useMemo(() => buildAnalysisTree(properties ?? [], query), [properties, query])

    const onSelectionPath = (node: AnalysisNode) =>
        node.id === selection.propertyId || node.id === selection.areaId
    const isOpen = (node: AnalysisNode) =>
        node.children.length > 0 && (searching || (toggled[node.id] ?? onSelectionPath(node)))
    const visible = flattenVisible(nodes, isOpen)
    const tabbableId = [focusedId, selectedId, visible[0]?.node.id].find(
        (id): id is string => id != null && visible.some((item) => item.node.id === id),
    )

    const setOpen = (node: AnalysisNode, open: boolean) => {
        if (!searching) setToggled((current) => ({ ...current, [node.id]: open }))
    }
    const activate = (node: AnalysisNode) => {
        void navigate(node.href)
        if (node.children.length > 0) setOpen(node, !isOpen(node))
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const itemId = (event.target as HTMLElement).dataset.treeId
        const action = resolveTreeKey(event.key, itemId, visible, isOpen, searching)
        if (!action) return
        event.preventDefault()
        if (action.type === "focus") items.current.get(action.id)?.focus()
        else if (action.type === "toggle") setOpen(action.node, action.open)
        else activate(action.node)
    }

    const context: AnalysisTreeContext = {
        selectedId,
        tabbableId,
        isOpen,
        onActivate: activate,
        onFocusItem: setFocusedId,
        registerItem: (id, element) => {
            if (element) items.current.set(id, element)
            else items.current.delete(id)
        },
    }

    return { query, setQuery, nodes, context, handleKeyDown }
}
