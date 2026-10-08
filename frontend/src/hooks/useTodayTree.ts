import { useState, type KeyboardEvent } from "react"
import { flattenVisible, resolveTreeKey, type AnalysisNode } from "@/lib/analysisTree"

/** O que cada linha da tabela hierárquica precisa saber, montado uma vez pelo pai. */
export interface TodayTreeContext {
    tabbableId: string | undefined
    isOpen: (node: AnalysisNode) => boolean
    toggle: (node: AnalysisNode) => void
    onFocusItem: (id: string) => void
    registerItem: (id: string, element: HTMLElement | null) => void
}

/**
 * Expansão, foco e teclado da tabela "Consumo de hoje". Tudo nasce recolhido;
 * a linha com foco é a única na ordem de tabulação (as demais se alcançam
 * pelas setas). Teclado no padrão de árvore, o mesmo de Análise: ↑ ↓ Home End
 * movem o foco, → expande, ← recolhe ou sobe ao pai, Enter e Espaço alternam.
 */
export const useTodayTree = (nodes: AnalysisNode[]) => {
    const [opened, setOpened] = useState<Record<string, boolean>>({})
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [items] = useState(() => new Map<string, HTMLElement>())

    const isOpen = (node: AnalysisNode) => node.children.length > 0 && (opened[node.id] ?? false)
    const visible = flattenVisible(nodes, isOpen)
    const tabbableId = [focusedId, visible[0]?.node.id].find(
        (id): id is string => id != null && visible.some((item) => item.node.id === id),
    )

    const setOpen = (node: AnalysisNode, open: boolean) =>
        setOpened((current) => ({ ...current, [node.id]: open }))
    const toggle = (node: AnalysisNode) => {
        if (node.children.length > 0) setOpen(node, !isOpen(node))
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const itemId = (event.target as HTMLElement).dataset.treeId
        const action = resolveTreeKey(event.key, itemId, visible, isOpen, false)
        if (!action) return
        event.preventDefault()
        if (action.type === "focus") items.get(action.id)?.focus()
        else if (action.type === "toggle") setOpen(action.node, action.open)
        else toggle(action.node)
    }

    const context: TodayTreeContext = {
        tabbableId,
        isOpen,
        toggle,
        onFocusItem: setFocusedId,
        registerItem: (id, element) => {
            if (element) items.set(id, element)
            else items.delete(id)
        },
    }

    return { context, handleKeyDown }
}
