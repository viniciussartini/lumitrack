import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage"
import { AUTH_LAYOUT_GRID_CLASS } from "@/components/auth/BrandPanel"
import { authService } from "@/services/auth.service"

vi.mock("@/services/auth.service", () => ({
    authService: {
        resetPassword: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(() => Promise.resolve(null)),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ResetPasswordPage — sem token na URL", () => {
    it("mostra a tela de link inválido em vez do formulário", async () => {
        renderWithProviders(<ResetPasswordPage />, {
            initialEntries: ["/reset-password"],
        })

        expect(await screen.findByRole("heading", { name: /link inválido/i })).toBeInTheDocument()
        expect(screen.queryByLabelText(/^nova senha$/i)).not.toBeInTheDocument()
    })

    it("usa a mesma largura de painel das demais telas de autenticação", async () => {
        const { container } = renderWithProviders(<ResetPasswordPage />, {
            initialEntries: ["/reset-password"],
        })
        await screen.findByRole("heading", { name: /link inválido/i })

        expect(container.firstElementChild).toHaveClass(AUTH_LAYOUT_GRID_CLASS)
    })
})

describe("ResetPasswordPage — com token", () => {
    const renderWithToken = () =>
        renderWithProviders(<ResetPasswordPage />, {
            initialEntries: ["/reset-password?token=abc123"],
        })

    it("mostra os campos de nova senha e confirmação", async () => {
        renderWithToken()

        expect(await screen.findByLabelText(/^nova senha$/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/confirmar nova senha/i)).toBeInTheDocument()
    })

    it("usa a mesma largura de painel das demais telas de autenticação", async () => {
        const { container } = renderWithToken()
        await screen.findByLabelText(/^nova senha$/i)

        expect(container.firstElementChild).toHaveClass(AUTH_LAYOUT_GRID_CLASS)
    })

    it("mostra erro quando as senhas não coincidem", async () => {
        const user = userEvent.setup()
        renderWithToken()

        await user.type(await screen.findByLabelText(/^nova senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar nova senha/i), "Outra@456")
        await user.click(screen.getByRole("button", { name: /redefinir senha/i }))

        expect(await screen.findByText(/as senhas não coincidem/i)).toBeInTheDocument()
        expect(authService.resetPassword).not.toHaveBeenCalled()
    })

    it("chama authService.resetPassword com o token da URL e mostra sucesso", async () => {
        vi.mocked(authService.resetPassword).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderWithToken()

        await user.type(await screen.findByLabelText(/^nova senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar nova senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /redefinir senha/i }))

        expect(
            await screen.findByRole("heading", { name: /senha redefinida/i }),
        ).toBeInTheDocument()
        expect(authService.resetPassword).toHaveBeenCalledWith("abc123", "Senha@123")
    })

    it("exibe a mensagem de erro quando o token é inválido ou expirado", async () => {
        vi.mocked(authService.resetPassword).mockRejectedValue(
            new Error("Token de redefinição inválido ou expirado"),
        )

        const user = userEvent.setup()
        renderWithToken()

        await user.type(await screen.findByLabelText(/^nova senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar nova senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /redefinir senha/i }))

        expect(
            await screen.findByText(/token de redefinição inválido ou expirado/i),
        ).toBeInTheDocument()
    })
})
