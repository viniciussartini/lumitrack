import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen, waitFor } from "@/tests/test-utils"
import { LoginPage } from "@/pages/auth/LoginPage"
import { AUTH_LAYOUT_GRID_CLASS } from "@/components/auth/BrandPanel"
import { authService } from "@/services/auth.service"
import { useTariffFlag } from "@/hooks/queries/useTariffFlag"
import type { User } from "@/types/auth.types"
import type { TariffFlagConfig } from "@/types/tariff-flag.types"

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

const mockTariffFlagConfig: TariffFlagConfig = {
    currentFlag: "GREEN",
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.885,
    redP1Per100Kwh: 4.463,
    redP2Per100Kwh: 7.877,
    updatedAt: new Date().toISOString(),
}

// Bandeira vem de GET /api/tariff-flag (leitura pública, #143) — mock no
// nível do hook evita precisar de um QueryClientProvider real neste teste.
vi.mock("@/hooks/queries/useTariffFlag", () => ({
    useTariffFlag: vi.fn(),
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
    vi.mocked(useTariffFlag).mockReturnValue({
        data: mockTariffFlagConfig,
        isLoading: false,
        isError: false,
    } as ReturnType<typeof useTariffFlag>)
})

describe("LoginPage — renderização", () => {
    it("mostra os campos de email, senha e o botão", async () => {
        renderWithProviders(<LoginPage />)

        expect(await screen.findByLabelText(/e-mail/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument()
    })

    it("usa a mesma largura de painel das demais telas de autenticação", async () => {
        const { container } = renderWithProviders(<LoginPage />)
        await screen.findByLabelText(/e-mail/i)

        expect(container.firstElementChild).toHaveClass(AUTH_LAYOUT_GRID_CLASS)
    })

    it("anima o card 'Ao vivo' via useLiveTicker em vez de um valor congelado", async () => {
        renderWithProviders(<LoginPage />)
        await screen.findByLabelText(/e-mail/i)

        const liveKwh = screen.getByTestId("login-live-kwh")
        const initialValue = liveKwh.textContent

        await waitFor(() => expect(liveKwh.textContent).not.toBe(initialValue), {
            timeout: 3000,
        })
    })
})

describe("LoginPage — bandeira tarifária vigente (#143)", () => {
    it("mostra a bandeira real vinda da API", async () => {
        renderWithProviders(<LoginPage />)

        expect(await screen.findByText("Bandeira")).toBeInTheDocument()
        expect(screen.getByText("Verde")).toBeInTheDocument()
    })

    it("mostra a bandeira e a cor correspondente quando não é verde", async () => {
        vi.mocked(useTariffFlag).mockReturnValue({
            data: { ...mockTariffFlagConfig, currentFlag: "RED_P2" },
            isLoading: false,
            isError: false,
        } as ReturnType<typeof useTariffFlag>)

        renderWithProviders(<LoginPage />)

        expect(await screen.findByText("Vermelha P2")).toBeInTheDocument()
    })

    it("não mostra o box de bandeira enquanto carrega ou em erro", async () => {
        vi.mocked(useTariffFlag).mockReturnValue({
            data: undefined,
            isLoading: false,
            isError: true,
        } as ReturnType<typeof useTariffFlag>)

        renderWithProviders(<LoginPage />)

        await screen.findByLabelText(/e-mail/i)
        expect(screen.queryByText("Bandeira")).not.toBeInTheDocument()
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
        await user.type(screen.getByLabelText(/^senha$/i), "qualquer")
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
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
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
        await user.type(screen.getByLabelText(/^senha$/i), "errada")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        expect(await screen.findByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
})

describe("LoginPage — login de demonstração (VITE_DEMO_MODE)", () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it("não mostra os botões de demo quando a flag está desligada", async () => {
        vi.stubEnv("VITE_DEMO_MODE", "false")
        renderWithProviders(<LoginPage />)

        await screen.findByRole("button", { name: /entrar/i })
        expect(
            screen.queryByRole("button", { name: /ver demo residencial/i }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole("button", { name: /ver demo comercial/i }),
        ).not.toBeInTheDocument()
    })

    it("mostra os dois botões de demo e loga com as credenciais fixas", async () => {
        vi.stubEnv("VITE_DEMO_MODE", "true")
        vi.mocked(authService.login).mockResolvedValue({ user: mockUser })

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        const residentialButton = await screen.findByRole("button", {
            name: /ver demo residencial/i,
        })
        expect(
            screen.getByRole("button", { name: /ver demo comercial/i }),
        ).toBeInTheDocument()

        await user.click(residentialButton)

        await waitFor(() => {
            expect(authService.login).toHaveBeenCalledWith({
                email: "demo.residencial@lumitrack.dev",
                password: "DemoLumi@2026",
            })
        })
    })

    it("exibe a mesma mensagem de erro do login normal quando o demo falha", async () => {
        vi.stubEnv("VITE_DEMO_MODE", "true")
        vi.mocked(authService.login).mockRejectedValue(
            new Error("Credenciais inválidas"),
        )

        const user = userEvent.setup()
        renderWithProviders(<LoginPage />)

        await user.click(
            await screen.findByRole("button", { name: /ver demo comercial/i }),
        )

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
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
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
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
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
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
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
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /entrar/i }))

        await screen.findByRole("heading", { name: /verificação em duas etapas/i })
        await user.click(screen.getByRole("button", { name: /voltar/i }))

        expect(
            await screen.findByRole("heading", { name: /entrar no lumitrack/i }),
        ).toBeInTheDocument()
    })
})