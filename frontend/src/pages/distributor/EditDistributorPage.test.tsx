import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { EditDistributorPage } from "@/pages/distributor/EditDistributorPage"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"

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

const mockDistributor: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/distribuidoras/dist-1/editar"]}>
                <Routes>
                    <Route
                        path="/distribuidoras/:id/editar"
                        element={<EditDistributorPage />} />
                    <Route
                        path="/distribuidoras"
                        element={<div>Lista</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("EditDistributorPage", () => {
    it("carrega e popula o form com os dados", async () => {
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)

        renderPage()

        expect(
            await screen.findByDisplayValue("CEMIG Distribuição S.A."),
        ).toBeInTheDocument()
        // taxRate convertido decimal → percentual: 0.12 → 12
        expect(screen.getByLabelText(/alíquota/i)).toHaveValue(12)
        expect(screen.getByLabelText(/cnpj/i)).toBeDisabled()
    })

    it("converte taxRate de volta para decimal no submit", async () => {
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(distributorService.update).mockResolvedValue({
            ...mockDistributor,
            name: "Novo Nome",
        })

        const user = userEvent.setup()
        renderPage()

        await screen.findByDisplayValue("CEMIG Distribuição S.A.")

        const nameInput = screen.getByLabelText(/nome/i)
        await user.clear(nameInput)
        await user.type(nameInput, "Novo Nome")

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(distributorService.update).toHaveBeenCalled()
        })

        const [calledId, payload] = vi.mocked(distributorService.update).mock.calls[0]
        expect(calledId).toBe("dist-1")
        expect(payload.name).toBe("Novo Nome")
        // taxRate veio como 12 (percentual UI), convertido pra 0.12
        expect(payload.taxRate).toBe(0.12)
        // CNPJ NÃO faz parte do payload de update
        expect(payload).not.toHaveProperty("cnpj")
    })

    it("mostra estado de erro quando getById falha", async () => {
        vi.mocked(distributorService.getById).mockRejectedValue(
            new Error("Não encontrada"),
        )

        renderPage()

        expect(
            await screen.findByText(/não foi possível carregar/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/não encontrada/i)).toBeInTheDocument()
    })
})