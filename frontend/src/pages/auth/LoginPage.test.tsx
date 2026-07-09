import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen, waitFor } from "@/tests/test-utils"
import { LoginPage } from "@/pages/auth/LoginPage"
import { authService } from "@/services/auth.service"
import type { User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        verifyMfaLogin: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(() => Promise.resolve(null)),
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
    mfaEnabled: false,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
        vi.mocked(authService.login).mockResolvedValue({ user: mockUser })

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

describe("LoginPage — MFA (segundo passo)", () => {
    it("troca para o form de código quando o login responde mfaRequired", async () => {
        vi.mocked(authService.login).mockResolvedValue({
            mfaRequired: true,
            mfaToken: "mfa-token-123",
        })

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        expect(
            await screen.findByRole("heading", { name: /verificação em duas etapas/i }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument()
    })

    it("chama verifyMfaLogin com o mfaToken e o código digitado", async () => {
        vi.mocked(authService.login).mockResolvedValue({
            mfaRequired: true,
            mfaToken: "mfa-token-123",
        })
        vi.mocked(authService.verifyMfaLogin).mockResolvedValue(mockUser)

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        await user.type(await screen.findByLabelText(/código de verificação/i), "123456")
        await user.click(screen.getByRole("button", { name: /verificar/i }))

        await waitFor(() => {
            expect(authService.verifyMfaLogin).toHaveBeenCalledWith({
                mfaToken: "mfa-token-123",
                code: "123456",
            })
        })
    })

    it("mostra erro inline quando o código do segundo passo é inválido", async () => {
        vi.mocked(authService.login).mockResolvedValue({
            mfaRequired: true,
            mfaToken: "mfa-token-123",
        })
        vi.mocked(authService.verifyMfaLogin).mockRejectedValue(
            new Error("Código inválido"),
        )

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        await user.type(await screen.findByLabelText(/código de verificação/i), "000000")
        await user.click(screen.getByRole("button", { name: /verificar/i }))

        expect(await screen.findByText(/código inválido/i)).toBeInTheDocument()
    })

    it("volta para o form de credenciais ao clicar em Voltar", async () => {
        vi.mocked(authService.login).mockResolvedValue({
            mfaRequired: true,
            mfaToken: "mfa-token-123",
        })

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "test@example.com")
        await user.type(screen.getByLabelText(/senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        await screen.findByRole("heading", { name: /verificação em duas etapas/i })
        await user.click(screen.getByRole("button", { name: /voltar/i }))

        expect(
            await screen.findByRole("heading", { name: /entrar na conta/i }),
        ).toBeInTheDocument()
    })
})