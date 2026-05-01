import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen, waitFor } from "@/tests/test-utils"
import { LoginPage } from "@/pages/auth/LoginPage"
import { authService } from "@/services/auth.service"
import type { JwtPayload, User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        fetchCurrentUser: vi.fn(),
        getStoredSession: vi.fn(() => null),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

const mockUser: User = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockPayload: JwtPayload = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 3600,
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("LoginPage — renderização", () => {
    it("mostra os campos de email, senha e o botão", async () => {
        renderWithProviders(<LoginPage />)

        expect(await screen.findByLabelText(/e-mail/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument()
    })
})

describe("LoginPage — validação client-side", () => {
    it("mostra erro quando email está vazio", async () => {
        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        const button = await screen.findByRole("button", { name: /entrar/i })
        await user.click(button)

        expect(await screen.findByText(/e-mail é obrigatório/i)).toBeInTheDocument()
    })

    it("mostra erro para email com formato inválido", async () => {
        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "nao-e-email")
        await user.type(screen.getByLabelText(/senha/i), "qualquer")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        expect(await screen.findByText(/e-mail inválido/i)).toBeInTheDocument()
    })
})

describe("LoginPage — submit", () => {
    it("chama authService.login com os dados quando válidos", async () => {
        vi.mocked(authService.login).mockResolvedValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        await waitFor(() => {
            expect(authService.login).toHaveBeenCalledWith({
                email: "test@example.com",
                password: "Senha@123",
            })
        })
    })

    it("exibe a mensagem de erro do servidor quando login falha", async () => {
        vi.mocked(authService.login).mockRejectedValue(
            new Error("Credenciais inválidas"),
        )

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "errada")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        expect(await screen.findByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
})