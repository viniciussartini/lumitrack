import { describe, it, expect } from "vitest"
import { buildAnalysisTree, flattenVisible, parseAnalysisSelection } from "@/lib/analysisTree"
import type { PropertyTreeNode } from "@/types/property.types"

const properties: PropertyTreeNode[] = [
    {
        id: "p1",
        name: "Casa da Praia",
        areas: [
            {
                id: "a1",
                name: "Cozinha",
                devices: [
                    { id: "d1", name: "Geladeira", powerWatts: 150 },
                    { id: "d2", name: "Micro-ondas", powerWatts: 1200 },
                ],
            },
            { id: "a2", name: "Sala", devices: [] },
        ],
    },
    {
        id: "p2",
        name: "Escritório",
        areas: [
            {
                id: "a3",
                name: "Recepção",
                devices: [{ id: "d3", name: "Ar-condicionado", powerWatts: null }],
            },
        ],
    },
]

const names = (nodes: { name: string }[]) => nodes.map((n) => n.name)

describe("buildAnalysisTree", () => {
    it("sem busca devolve toda a hierarquia com a rota de cada nível", () => {
        const tree = buildAnalysisTree(properties, "")

        expect(names(tree)).toEqual(["Casa da Praia", "Escritório"])
        expect(tree[0]!.href).toBe("/propriedades/p1")
        expect(tree[0]!.children[0]!.href).toBe("/propriedades/p1/areas/a1")
        expect(tree[0]!.children[0]!.children[0]!.href).toBe("/propriedades/p1/areas/a1/devices/d1")
    })

    it("propriedade que casa mostra todos os descendentes", () => {
        const tree = buildAnalysisTree(properties, "praia")

        expect(names(tree)).toEqual(["Casa da Praia"])
        expect(names(tree[0]!.children)).toEqual(["Cozinha", "Sala"])
        expect(names(tree[0]!.children[0]!.children)).toEqual(["Geladeira", "Micro-ondas"])
    })

    it("área que casa mostra seus dispositivos e mantém o pai, sem as áreas irmãs", () => {
        const tree = buildAnalysisTree(properties, "cozinha")

        expect(names(tree)).toEqual(["Casa da Praia"])
        expect(names(tree[0]!.children)).toEqual(["Cozinha"])
        expect(names(tree[0]!.children[0]!.children)).toEqual(["Geladeira", "Micro-ondas"])
    })

    it("dispositivo que casa mantém só a cadeia até ele", () => {
        const tree = buildAnalysisTree(properties, "geladeira")

        expect(names(tree[0]!.children)).toEqual(["Cozinha"])
        expect(names(tree[0]!.children[0]!.children)).toEqual(["Geladeira"])
    })

    it("ignora acento e caixa na busca", () => {
        expect(names(buildAnalysisTree(properties, "ESCRITORIO"))).toEqual(["Escritório"])
        expect(names(buildAnalysisTree(properties, "recepcao")[0]!.children)).toEqual(["Recepção"])
    })

    it("devolve vazio quando nada casa", () => {
        expect(buildAnalysisTree(properties, "inexistente")).toEqual([])
    })
})

describe("flattenVisible", () => {
    const tree = buildAnalysisTree(properties, "")

    it("lista só os nós alcançáveis: filhos de nó recolhido ficam de fora", () => {
        const items = flattenVisible(tree, (node) => node.id === "p1")

        expect(items.map((i) => i.node.id)).toEqual(["p1", "a1", "a2", "p2"])
        expect(items.map((i) => i.level)).toEqual([1, 2, 2, 1])
        expect(items[1]!.parentId).toBe("p1")
        expect(items[0]!.parentId).toBeNull()
    })

    it("expandindo tudo lista os dispositivos em ordem de leitura", () => {
        const items = flattenVisible(tree, () => true)

        expect(items.map((i) => i.node.id)).toEqual([
            "p1",
            "a1",
            "d1",
            "d2",
            "a2",
            "p2",
            "a3",
            "d3",
        ])
    })
})

describe("parseAnalysisSelection", () => {
    it("lê a seleção de cada rota de detalhe", () => {
        expect(parseAnalysisSelection("/propriedades")).toEqual({})
        expect(parseAnalysisSelection("/propriedades/p1")).toEqual({ propertyId: "p1" })
        expect(parseAnalysisSelection("/propriedades/p1/areas/a1")).toEqual({
            propertyId: "p1",
            areaId: "a1",
        })
        expect(parseAnalysisSelection("/propriedades/p1/areas/a1/devices/d1")).toEqual({
            propertyId: "p1",
            areaId: "a1",
            deviceId: "d1",
        })
    })

    it("não trata as páginas de comparação como seleção da árvore", () => {
        expect(parseAnalysisSelection("/propriedades/p1/comparacao-acl")).toEqual({})
    })
})
