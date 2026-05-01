import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { NewDistributorPage } from "@/pages/distributor/NewDistributorPage"
import { distributorService } from "@/services/distributor.service"

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/distribuidoras/nova"]}>
                <Routes>
                    <Route
                        path="/distribuidoras/nova"
                        element={<NewDistributorPage />} />
                    <Route
                        path="/distribuidoras"
                        element={<div>Lista de distribuidoras</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("NewDistributorPage", () => {
    it("renderiza título e link de voltar", () => {
        renderPage()

        expect(
            screen.getByRole("heading", { name: /nova distribuidora/i, level: 1 }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para distribuidoras/i }),
        ).toBeInTheDocument()
    })

    it("converte taxRate de percentual para decimal antes de enviar", async () => {
        vi.mocked(distributorService.create).mockResolvedValue({
            id: "new-id",
            userId: "user-1",
            name: "Teste",
            cnpj: "06.981.180/0001-16",
            electricalSystem: "TRIPHASIC",
            workingVoltage: 220,
            kwhPrice: 0.75,
            taxRate: 0.12,
            publicLightingFee: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })

        const user = userEvent.setup()
        renderPage()

        await user.type(
            screen.getByLabelText(/nome da distribuidora/i),
            "Teste",
        )
        await user.type(screen.getByLabelText(/cnpj/i), "06981180000116")
        await user.selectOptions(
            screen.getByLabelText(/sistema elétrico/i),
            "TRIPHASIC",
        )
        await user.selectOptions(
            screen.getByLabelText(/tensão de trabalho/i),
            "220",
        )
        await user.type(screen.getByLabelText(/preço do kwh/i), "0.75")
        // 12 (UI) deve virar 0.12 (backend)
        await user.type(screen.getByLabelText(/alíquota/i), "12")

        await user.click(
            screen.getByRole("button", { name: /criar distribuidora/i }),
        )

        await waitFor(() => {
            expect(distributorService.create).toHaveBeenCalled()
        })

        const sentPayload = vi.mocked(distributorService.create).mock.calls[0][0]
        expect(sentPayload.taxRate).toBe(0.12)
    })

    it("redireciona para /distribuidoras após sucesso", async () => {
        vi.mocked(distributorService.create).mockResolvedValue({
            id: "new-id",
            userId: "user-1",
            name: "Teste",
            cnpj: "06.981.180/0001-16",
            electricalSystem: "TRIPHASIC",
            workingVoltage: 220,
            kwhPrice: 0.75,
            taxRate: null,
            publicLightingFee: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })

        const user = userEvent.setup()
        renderPage()

        await user.type(screen.getByLabelText(/nome/i), "Teste")
        await user.type(screen.getByLabelText(/cnpj/i), "06981180000116")
        await user.selectOptions(
            screen.getByLabelText(/sistema elétrico/i),
            "TRIPHASIC",
        )
        await user.selectOptions(
            screen.getByLabelText(/tensão de trabalho/i),
            "220",
        )
        await user.type(screen.getByLabelText(/preço do kwh/i), "0.75")

        await user.click(
            screen.getByRole("button", { name: /criar distribuidora/i }),
        )

        expect(
            await screen.findByText("Lista de distribuidoras"),
        ).toBeInTheDocument()
    })
})