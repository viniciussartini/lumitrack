import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen, waitFor } from "@/tests/test-utils"
import { UserMenu } from "@/components/layout/UserMenu"
import { authService } from "@/services/auth.service"
import type { User } from "@/types/auth.types"

const mockNavigate = vi.fn()
vi.mock("react-router", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router")>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
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

beforeEach(() => {
    vi.clearAllMocks()
})

const renderWithUser = (user: User) => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user)
    return renderWithProviders(<UserMenu />)
}

describe("UserMenu — renderização", () => {
    it("exibe nome, iniciais e tipo de conta para pessoa física", async () => {
        renderWithUser(mockUserPF)

        // Aguarda o AuthContext hidratar
        expect(await screen.findByText("João Silva")).toBeInTheDocument()
        expect(screen.getByText("JS")).toBeInTheDocument()
        expect(screen.getByText("Pessoa Física")).toBeInTheDocument()
    })

    it("exibe tradeName, inicial e tipo de conta para pessoa jurídica", async () => {
        renderWithUser(mockUserPJ)

        expect(await screen.findByText("Empresa")).toBeInTheDocument()
        expect(screen.getByText("E")).toBeInTheDocument()
        expect(screen.getByText("Pessoa Jurídica")).toBeInTheDocument()
    })

    it("começa fechado — dropdown não está visível", async () => {
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })
})

describe("UserMenu — interação", () => {
    it("abre o dropdown ao clicar no botão", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))

        expect(screen.getByRole("menu")).toBeInTheDocument()
        expect(screen.getByText("joao@example.com")).toBeInTheDocument()
    })

    it("aria-expanded reflete o estado", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        const trigger = screen.getByRole("button", { name: /menu do usuário/i })
        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)
        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })

    it("fecha ao pressionar Escape", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))
        expect(screen.getByRole("menu")).toBeInTheDocument()

        await user.keyboard("{Escape}")
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("fecha ao clicar fora do menu", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))
        expect(screen.getByRole("menu")).toBeInTheDocument()

        // Click no body, fora do container do menu
        await user.click(document.body)
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })
})

describe("UserMenu — navegação", () => {
    it("navega para /seguranca ao clicar em Segurança", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))
        await user.click(screen.getByRole("menuitem", { name: /segurança/i }))

        expect(mockNavigate).toHaveBeenCalledWith("/seguranca")
    })

    it("navega para /perfil ao clicar em Perfil", async () => {
        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))
        await user.click(screen.getByRole("menuitem", { name: /^perfil$/i }))

        expect(mockNavigate).toHaveBeenCalledWith("/perfil")
    })
})

describe("UserMenu — logout", () => {
    it("chama authService.logout ao clicar em Sair", async () => {
        vi.mocked(authService.logout).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderWithUser(mockUserPF)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))
        await user.click(screen.getByRole("menuitem", { name: /sair/i }))

        await waitFor(() => {
            expect(authService.logout).toHaveBeenCalledTimes(1)
        })
    })
})
