import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { DistributorMenu } from "@/components/distributor/DistributorMenu"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"
import { toast } from "sonner"

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

const renderMenu = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <DistributorMenu distributor={mockDistributor} />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("DistributorMenu — abertura do menu", () => {
    it("começa fechado", () => {
        renderMenu()

        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("abre ao clicar no botão de opções", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de CEMIG/i }),
        )

        expect(screen.getByRole("menu")).toBeInTheDocument()
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })
})

describe("DistributorMenu — exclusão", () => {
    it("abre ConfirmDialog ao clicar em Excluir no menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de CEMIG/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        expect(
            screen.getByRole("heading", { name: /excluir distribuidora/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/tem certeza que deseja excluir "CEMIG/i),
        ).toBeInTheDocument()
    })

    it("dispara mutation ao confirmar exclusão", async () => {
        vi.mocked(distributorService.delete).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de CEMIG/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(
            screen.getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() => {
            expect(distributorService.delete).toHaveBeenCalledWith("dist-1")
        })
    })

    it("mostra toast amigável quando backend rejeita por propriedades vinculadas", async () => {
        vi.mocked(distributorService.delete).mockRejectedValue(
            new Error("Distribuidora possui propriedades vinculadas"),
        )

        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de CEMIG/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Não é possível excluir",
                expect.objectContaining({
                    description: expect.stringContaining("propriedades vinculadas"),
                }),
            )
        })
    })
})