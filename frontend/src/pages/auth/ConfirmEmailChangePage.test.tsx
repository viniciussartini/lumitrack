import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { ConfirmEmailChangePage } from "@/pages/auth/ConfirmEmailChangePage"
import { AUTH_LAYOUT_GRID_CLASS } from "@/components/auth/BrandPanel"
import { authService } from "@/services/auth.service"

vi.mock("@/services/auth.service", () => ({
    authService: {
        confirmEmailChange: vi.fn(),
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

describe("ConfirmEmailChangePage — sem token na URL", () => {
    it("mostra a tela de link inválido sem chamar o service", async () => {
        renderWithProviders(<ConfirmEmailChangePage />, {
            initialEntries: ["/confirmar-email"],
        })

        expect(await screen.findByRole("heading", { name: /link inválido/i })).toBeInTheDocument()
        expect(authService.confirmEmailChange).not.toHaveBeenCalled()
    })

    it("usa a mesma largura de painel das demais telas de autenticação", async () => {
        const { container } = renderWithProviders(<ConfirmEmailChangePage />, {
            initialEntries: ["/confirmar-email"],
        })
        await screen.findByRole("heading", { name: /link inválido/i })

        expect(container.firstElementChild).toHaveClass(AUTH_LAYOUT_GRID_CLASS)
    })
})

describe("ConfirmEmailChangePage — com token", () => {
    const renderWithToken = () =>
        renderWithProviders(<ConfirmEmailChangePage />, {
            initialEntries: ["/confirmar-email?token=abc123"],
        })

    it("chama authService.confirmEmailChange com o token da URL exatamente uma vez", async () => {
        vi.mocked(authService.confirmEmailChange).mockResolvedValue(undefined)

        renderWithToken()

        await screen.findByRole("heading", { name: /e-mail atualizado/i })
        expect(authService.confirmEmailChange).toHaveBeenCalledWith("abc123")
        expect(authService.confirmEmailChange).toHaveBeenCalledOnce()
    })

    it("mostra sucesso e um CTA para /login quando confirma", async () => {
        vi.mocked(authService.confirmEmailChange).mockResolvedValue(undefined)

        renderWithToken()

        expect(
            await screen.findByRole("heading", { name: /e-mail atualizado/i }),
        ).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /ir para o login/i })).toHaveAttribute(
            "href",
            "/login",
        )
    })

    it("mostra a mensagem de erro quando o token é inválido/expirado/já usado", async () => {
        vi.mocked(authService.confirmEmailChange).mockRejectedValue(
            new Error("Token de confirmação inválido ou expirado"),
        )

        renderWithToken()

        expect(
            await screen.findByText(/token de confirmação inválido ou expirado/i),
        ).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /voltar para o perfil/i })).toHaveAttribute(
            "href",
            "/perfil",
        )
    })
})
