import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, useLocation } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { AnalysisTree } from "@/components/analysis/AnalysisTree"
import { propertyService } from "@/services/property.service"
import type { PropertyTree } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

const TREE: PropertyTree = {
    total: 2,
    items: [
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
        { id: "p2", name: "Escritório", areas: [] },
    ],
}

const LocationProbe = () => <span data-testid="pathname">{useLocation().pathname}</span>

const renderTree = (initialPath = "/propriedades") => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialPath]}>
                <AnalysisTree />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

const item = (name: string) => screen.getByRole("treeitem", { name })
const pathname = () => screen.getByTestId("pathname").textContent

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
})

describe("AnalysisTree — estrutura e acessibilidade", () => {
    it("mostra as propriedades como árvore, com áreas e dispositivos recolhidos", async () => {
        renderTree()

        expect(await screen.findByRole("tree")).toBeInTheDocument()
        expect(screen.getAllByRole("treeitem").map((el) => el.textContent)).toEqual([
            "Casa da Praia",
            "Escritório",
        ])
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "false")
        expect(item("Casa da Praia")).toHaveAttribute("aria-level", "1")
    })

    it("só quem tem filhos é expansível", async () => {
        renderTree("/propriedades/p1/areas/a2")
        await screen.findByRole("tree")

        expect(item("Escritório")).not.toHaveAttribute("aria-expanded")
        expect(item("Sala")).not.toHaveAttribute("aria-expanded")
        expect(item("Cozinha")).toHaveAttribute("aria-expanded", "false")
    })

    it("uma única linha fica no ciclo de Tab (roving tabindex)", async () => {
        renderTree()
        await screen.findByRole("tree")

        const tabbable = screen
            .getAllByRole("treeitem")
            .filter((el) => el.getAttribute("tabindex") === "0")
        expect(tabbable).toHaveLength(1)
        expect(tabbable[0]).toBe(item("Casa da Praia"))
    })
})

describe("AnalysisTree — seleção pela URL", () => {
    it("destaca o dispositivo do link e expande o caminho até ele", async () => {
        renderTree("/propriedades/p1/areas/a1/devices/d2")
        await screen.findByRole("tree")

        expect(item("Micro-ondas")).toHaveAttribute("aria-selected", "true")
        expect(item("Micro-ondas")).toHaveAttribute("aria-level", "3")
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "true")
        expect(item("Cozinha")).toHaveAttribute("aria-expanded", "true")
        expect(item("Geladeira")).toHaveAttribute("aria-selected", "false")
    })

    it("sem item selecionado na URL, nenhuma linha fica selecionada", async () => {
        renderTree("/propriedades")
        await screen.findByRole("tree")

        expect(
            screen
                .getAllByRole("treeitem")
                .every((el) => el.getAttribute("aria-selected") === "false"),
        ).toBe(true)
    })
})

describe("AnalysisTree — clique", () => {
    it("abre o detalhe da propriedade e expande suas áreas", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        await user.click(item("Casa da Praia"))

        expect(pathname()).toBe("/propriedades/p1")
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "true")
        expect(item("Cozinha")).toBeInTheDocument()
    })

    it("clicar de novo na propriedade selecionada recolhe seus filhos", async () => {
        const user = userEvent.setup()
        renderTree("/propriedades/p1")
        await screen.findByRole("tree")

        await user.click(item("Casa da Praia"))

        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("treeitem", { name: "Cozinha" })).not.toBeInTheDocument()
    })

    it("abre o detalhe da área e do dispositivo", async () => {
        const user = userEvent.setup()
        renderTree("/propriedades/p1")
        await screen.findByRole("tree")

        await user.click(item("Cozinha"))
        expect(pathname()).toBe("/propriedades/p1/areas/a1")

        await user.click(item("Geladeira"))
        expect(pathname()).toBe("/propriedades/p1/areas/a1/devices/d1")
    })
})

describe("AnalysisTree — busca", () => {
    it("filtra por nome e expande os nós com resultado", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        await user.type(
            screen.getByRole("searchbox", { name: "Buscar na hierarquia" }),
            "geladeira",
        )

        expect(screen.getAllByRole("treeitem").map((el) => el.textContent)).toEqual([
            "Casa da Praia",
            "Cozinha",
            "Geladeira",
        ])
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "true")
        expect(item("Cozinha")).toHaveAttribute("aria-expanded", "true")
    })

    it("propriedade que casa mostra todos os descendentes", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        await user.type(screen.getByRole("searchbox"), "praia")

        expect(screen.getAllByRole("treeitem").map((el) => el.textContent)).toEqual([
            "Casa da Praia",
            "Cozinha",
            "Geladeira",
            "Micro-ondas",
            "Sala",
        ])
    })

    it("avisa quando nada casa", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        await user.type(screen.getByRole("searchbox"), "zzz")

        expect(screen.getByText("Nenhum resultado para a busca.")).toBeInTheDocument()
        expect(screen.queryByRole("tree")).not.toBeInTheDocument()
    })
})

describe("AnalysisTree — teclado", () => {
    it("setas percorrem as linhas visíveis; Home e End vão às pontas", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        item("Casa da Praia").focus()
        await user.keyboard("{ArrowDown}")
        expect(item("Escritório")).toHaveFocus()

        await user.keyboard("{ArrowUp}")
        expect(item("Casa da Praia")).toHaveFocus()

        await user.keyboard("{End}")
        expect(item("Escritório")).toHaveFocus()

        await user.keyboard("{Home}")
        expect(item("Casa da Praia")).toHaveFocus()
    })

    it("→ expande e depois entra no primeiro filho; ← sobe ao pai e depois recolhe", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")
        item("Casa da Praia").focus()

        await user.keyboard("{ArrowRight}")
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "true")

        await user.keyboard("{ArrowRight}")
        expect(item("Cozinha")).toHaveFocus()

        await user.keyboard("{ArrowLeft}")
        expect(item("Casa da Praia")).toHaveFocus()

        await user.keyboard("{ArrowLeft}")
        expect(item("Casa da Praia")).toHaveAttribute("aria-expanded", "false")
    })

    it("Enter e Espaço abrem o item em foco", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        item("Escritório").focus()
        await user.keyboard("{Enter}")
        expect(pathname()).toBe("/propriedades/p2")

        item("Casa da Praia").focus()
        await user.keyboard(" ")
        expect(pathname()).toBe("/propriedades/p1")
    })

    it("digitar na busca não aciona os atalhos da árvore", async () => {
        const user = userEvent.setup()
        renderTree()
        await screen.findByRole("tree")

        await user.type(screen.getByRole("searchbox"), " ")

        expect(pathname()).toBe("/propriedades")
    })
})

describe("AnalysisTree — estados", () => {
    it("avisa que o teto da árvore cortou propriedades", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ ...TREE, total: 130 })
        renderTree()

        expect(await screen.findByText("Mostrando 2 de 130 propriedades.")).toBeInTheDocument()
    })

    it("sem propriedades, leva ao Cadastro", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ items: [], total: 0 })
        renderTree()

        const link = await screen.findByRole("link", { name: "Cadastre em Configurações" })
        expect(link).toHaveAttribute("href", "/configuracoes/cadastro")
        expect(screen.queryByRole("tree")).not.toBeInTheDocument()
    })

    it("mostra carregando enquanto a árvore não chega", () => {
        vi.mocked(propertyService.getTree).mockReturnValue(new Promise(() => {}))
        renderTree()

        expect(screen.getByText("Carregando hierarquia…")).toBeInTheDocument()
    })

    it("oferece tentar de novo quando a árvore falha", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockRejectedValueOnce(new Error("falhou"))
        renderTree()

        const alert = await screen.findByRole("alert")
        await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }))

        expect(await screen.findByRole("tree")).toBeInTheDocument()
        expect(propertyService.getTree).toHaveBeenCalledTimes(2)
    })
})
