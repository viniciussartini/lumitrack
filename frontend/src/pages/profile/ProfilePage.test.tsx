import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProfilePage } from "@/pages/profile/ProfilePage"
import { authService } from "@/services/auth.service"
import { userService } from "@/services/user.service"
import type { User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

vi.mock("@/services/user.service", () => ({
    userService: { update: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockUserPF: User = {
    id: "user-123",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    mfaEnabled: false,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockUserPJ: User = {
    id: "user-456",
    email: "contato@empresa.com",
    userType: "COMPANY",
    mfaEnabled: false,
    companyName: "Empresa Ltda",
    tradeName: "Empresa",
    cnpj: "11.222.333/0001-81",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderPage = (user: User = mockUserPF) => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user)
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AuthProvider>
                    <ProfilePage />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ProfilePage — modo leitura", () => {
    it("mostra nome, sobrenome, CPF mascarado, e-mail e tipo de conta (PF)", async () => {
        renderPage(mockUserPF)

        expect(await screen.findByRole("heading", { name: "João Silva" })).toBeInTheDocument()
        expect(screen.getByText("João")).toBeInTheDocument()
        expect(screen.getByText("Silva")).toBeInTheDocument()
        expect(screen.getByText("•••.•••.247-25")).toBeInTheDocument()
        expect(screen.getAllByText("joao@example.com").length).toBeGreaterThan(0)
        expect(screen.getAllByText("Pessoa Física").length).toBeGreaterThan(0)
    })

    it("mostra razão social, nome fantasia, CNPJ mascarado e tipo de conta (PJ)", async () => {
        renderPage(mockUserPJ)

        expect(await screen.findByRole("heading", { name: "Empresa" })).toBeInTheDocument()
        expect(screen.getByText("Empresa Ltda")).toBeInTheDocument()
        expect(screen.getByText("••.•••.•••/0001-81")).toBeInTheDocument()
        expect(screen.getAllByText("Pessoa Jurídica").length).toBeGreaterThan(0)
    })
})

describe("ProfilePage — edição", () => {
    it("Cancelar volta ao modo leitura sem salvar", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: /cancelar/i }))
        expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument()
        expect(userService.update).not.toHaveBeenCalled()
    })

    it("CPF/CNPJ sempre aparece desabilitado no form", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))

        expect(screen.getByLabelText("CPF")).toBeDisabled()
    })

    it("salva as alterações, sai do modo edição e atualiza o AuthContext", async () => {
        const updatedUser: User = { ...mockUserPF, firstName: "Joana" }
        vi.mocked(userService.update).mockResolvedValue(updatedUser)
        vi.mocked(authService.getCurrentUser)
            .mockResolvedValueOnce(mockUserPF)
            .mockResolvedValueOnce(updatedUser)

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        const firstNameInput = screen.getByLabelText("Nome")
        await user.clear(firstNameInput)
        await user.type(firstNameInput, "Joana")
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await waitFor(() => {
            expect(userService.update).toHaveBeenCalledWith("user-123", {
                firstName: "Joana",
                lastName: "Silva",
                email: "joao@example.com",
            })
        })
        expect(await screen.findByRole("heading", { name: "Joana Silva" })).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalled()
    })

    it("mostra erro e permanece em edição quando a mutation falha", async () => {
        vi.mocked(userService.update).mockRejectedValue(new Error("E-mail já cadastrado"))

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })
        expect(screen.getByRole("button", { name: /salvar alterações/i })).toBeInTheDocument()
    })
})
