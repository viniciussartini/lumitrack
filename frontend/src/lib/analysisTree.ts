import { matchPath } from "react-router"
import type { PropertyTreeNode } from "@/types/property.types"

export interface AnalysisNode {
    id: string
    name: string
    kind: "property" | "area" | "device"
    /** Rota de detalhe do item, a mesma que as demais telas usam para linká-lo. */
    href: string
    children: AnalysisNode[]
}

export interface AnalysisSelection {
    propertyId?: string
    areaId?: string
    deviceId?: string
}

export interface VisibleItem {
    node: AnalysisNode
    /** 1 propriedade, 2 área, 3 dispositivo. */
    level: 1 | 2 | 3
    parentId: string | null
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Monta a árvore de seleção de Análise já filtrada pela busca. Quem casa por
 * nome mostra todos os descendentes; quem só tem descendente que casa fica
 * apenas com a cadeia até ele. A busca ignora caixa e acento.
 */
export const buildAnalysisTree = (
    properties: PropertyTreeNode[],
    query: string,
): AnalysisNode[] => {
    const needle = normalize(query.trim())
    const hit = (name: string) => needle === "" || normalize(name).includes(needle)

    return properties.flatMap((property) => {
        const propertyHref = `/propriedades/${property.id}`
        const propertyHit = hit(property.name)

        const areas = property.areas.flatMap((area): AnalysisNode[] => {
            const areaHref = `${propertyHref}/areas/${area.id}`
            const areaHit = propertyHit || hit(area.name)
            const devices = area.devices
                .filter((device) => areaHit || hit(device.name))
                .map((device): AnalysisNode => ({
                    id: device.id,
                    name: device.name,
                    kind: "device",
                    href: `${areaHref}/devices/${device.id}`,
                    children: [],
                }))
            if (!areaHit && devices.length === 0) return []
            return [
                { id: area.id, name: area.name, kind: "area", href: areaHref, children: devices },
            ]
        })

        if (!propertyHit && areas.length === 0) return []
        return [
            {
                id: property.id,
                name: property.name,
                kind: "property",
                href: propertyHref,
                children: areas,
            } satisfies AnalysisNode,
        ]
    })
}

/**
 * Nós alcançáveis em ordem de leitura — o que a navegação por teclado
 * percorre. Filhos de nó recolhido não entram.
 */
export const flattenVisible = (
    nodes: AnalysisNode[],
    isOpen: (node: AnalysisNode) => boolean,
    parentId: string | null = null,
    level: 1 | 2 | 3 = 1,
): VisibleItem[] =>
    nodes.flatMap((node) => [
        { node, level, parentId },
        ...(isOpen(node)
            ? flattenVisible(node.children, isOpen, node.id, Math.min(level + 1, 3) as 2 | 3)
            : []),
    ])

/** Qual item da árvore a URL atual seleciona. Fora das rotas de detalhe, nenhum. */
export const parseAnalysisSelection = (pathname: string): AnalysisSelection => {
    const device = matchPath("/propriedades/:propertyId/areas/:areaId/devices/:deviceId", pathname)
    if (device) {
        const { propertyId, areaId, deviceId } = device.params
        return { propertyId, areaId, deviceId }
    }
    const area = matchPath("/propriedades/:propertyId/areas/:areaId", pathname)
    if (area) {
        const { propertyId, areaId } = area.params
        return { propertyId, areaId }
    }
    const property = matchPath("/propriedades/:propertyId", pathname)
    return property ? { propertyId: property.params.propertyId } : {}
}

export type TreeKeyAction =
    | { type: "focus"; id: string }
    | { type: "toggle"; node: AnalysisNode; open: boolean }
    | { type: "activate"; node: AnalysisNode }

const MOVES: Record<string, (index: number, length: number) => number> = {
    ArrowDown: (index) => index + 1,
    ArrowUp: (index) => index - 1,
    Home: () => 0,
    End: (_index, length) => length - 1,
}

const focusAction = (item: VisibleItem | undefined): TreeKeyAction | null =>
    item ? { type: "focus", id: item.node.id } : null

/**
 * O que uma tecla faz na linha com foco, no padrão de árvore do WAI-ARIA:
 * setas/Home/End movem o foco; → expande ou entra no primeiro filho; ←
 * recolhe ou sobe ao pai; Enter/Espaço ativam. `null` = tecla ignorada. Com
 * busca ativa a expansão é automática, então → e ← só movem o foco.
 */
export const resolveTreeKey = (
    key: string,
    itemId: string | undefined,
    visible: VisibleItem[],
    isOpen: (node: AnalysisNode) => boolean,
    searching: boolean,
): TreeKeyAction | null => {
    const index = visible.findIndex((item) => item.node.id === itemId)
    const current = visible[index]
    if (!current) return null

    const move = MOVES[key]
    if (move) return focusAction(visible[move(index, visible.length)])
    if (key === "Enter" || key === " ") return { type: "activate", node: current.node }

    const { node } = current
    const open = isOpen(node)
    if (key === "ArrowRight" && node.children.length > 0) {
        return open || searching
            ? focusAction(visible[index + 1])
            : { type: "toggle", node, open: true }
    }
    if (key === "ArrowLeft") {
        return open && !searching
            ? { type: "toggle", node, open: false }
            : focusAction(visible.find((item) => item.node.id === current.parentId))
    }
    return null
}
