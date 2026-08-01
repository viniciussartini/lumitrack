import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage"
import { authService } from "@/services/auth.service"

vi.mock("@/services/auth.service", () => ({
    authService: {
        forgotPassword: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(() => Promise.resolve(null)),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ForgotPasswordPage — renderização", () => {
    it("mostra o campo de e-mail e o botão de envio", async () => {
        renderWithProviders(<ForgotPasswordPage />)

        expect(await screen.findByLabelText(/e-mail cadastrado/i)).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /enviar link de recuperação/i }),
        ).toBeInTheDocument()
    })
})

describe("ForgotPasswordPage — validação", () => {
    it("mostra erro para e-mail inválido", async () => {
        const user = userEvent.setup()
        renderWithProviders(<ForgotPasswordPage />)

        await user.type(await screen.findByLabelText(/e-mail cadastrado/i), "nao-e-email")
        await user.click(screen.getByRole("button", { name: /enviar link/i }))

        expect(await screen.findByText(/e-mail inválido/i)).toBeInTheDocument()
        expect(authService.forgotPassword).not.toHaveBeenCalled()
    })
})

describe("ForgotPasswordPage — fluxo de sucesso", () => {
    it("chama authService.forgotPassword e mostra a tela de link enviado", async () => {
        vi.mocked(authService.forgotPassword).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderWithProviders(<ForgotPasswordPage />)

        await user.type(
            await screen.findByLabelText(/e-mail cadastrado/i),
            "joao@example.com",
        )
        await user.click(screen.getByRole("button", { name: /enviar link/i }))

        expect(await screen.findByRole("heading", { name: /link enviado/i })).toBeInTheDocument()
        expect(screen.getByText("joao@example.com")).toBeInTheDocument()
        expect(authService.forgotPassword).toHaveBeenCalledWith("joao@example.com")
    })

    it("volta para o formulário ao clicar em 'Reenviar para outro e-mail'", async () => {
        vi.mocked(authService.forgotPassword).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderWithProviders(<ForgotPasswordPage />)

        await user.type(
            await screen.findByLabelText(/e-mail cadastrado/i),
            "joao@example.com",
        )
        await user.click(screen.getByRole("button", { name: /enviar link/i }))

        await screen.findByRole("heading", { name: /link enviado/i })
        await user.click(screen.getByRole("button", { name: /reenviar para outro e-mail/i }))

        expect(await screen.findByLabelText(/e-mail cadastrado/i)).toBeInTheDocument()
    })
})

describe("ForgotPasswordPage — erro do servidor", () => {
    it("exibe a mensagem de erro quando a chamada falha", async () => {
        vi.mocked(authService.forgotPassword).mockRejectedValue(
            new Error("Erro ao processar solicitação"),
        )

        const user = userEvent.setup()
        renderWithProviders(<ForgotPasswordPage />)

        await user.type(
            await screen.findByLabelText(/e-mail cadastrado/i),
            "joao@example.com",
        )
        await user.click(screen.getByRole("button", { name: /enviar link/i }))

        expect(
            await screen.findByText(/erro ao processar solicitação/i),
        ).toBeInTheDocument()
    })
})
