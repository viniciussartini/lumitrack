import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"
import { render, screen } from "@testing-library/react"
import { AnalysisLayout } from "@/pages/analysis/AnalysisLayout"
import { AnalysisEmptyState } from "@/pages/analysis/AnalysisEmptyState"
import { propertyService } from "@/services/property.service"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

const renderLayout = (initialPath: string) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route path="/propriedades" element={<AnalysisLayout />}>
                        <Route index element={<AnalysisEmptyState />} />
                        <Route path=":id" element={<div>Detalhe da propriedade</div>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getTree).mockResolvedValue({
        total: 1,
        items: [{ id: "p1", name: "Casa", areas: [] }],
    })
})

describe("AnalysisLayout", () => {
    it("sem seleção, mostra a árvore e o convite para escolher o que analisar", async () => {
        renderLayout("/propriedades")

        expect(await screen.findByRole("tree")).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { name: "Selecione o que deseja analisar" }),
        ).toBeInTheDocument()
    })

    it("mostra o detalhe ao lado da árvore, que continua na tela", async () => {
        renderLayout("/propriedades/p1")

        expect(await screen.findByText("Detalhe da propriedade")).toBeInTheDocument()
        expect(await screen.findByRole("tree")).toBeInTheDocument()
        expect(screen.getByRole("treeitem", { name: "Casa" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
    })

    it("selecionar um item troca o convite pelo detalhe sem recarregar a árvore", async () => {
        const user = userEvent.setup()
        renderLayout("/propriedades")

        await user.click(await screen.findByRole("treeitem", { name: "Casa" }))

        expect(await screen.findByText("Detalhe da propriedade")).toBeInTheDocument()
        expect(screen.queryByText("Selecione o que deseja analisar")).not.toBeInTheDocument()
        expect(propertyService.getTree).toHaveBeenCalledTimes(1)
    })
})
