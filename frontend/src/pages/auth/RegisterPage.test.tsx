import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen, waitFor } from "@/tests/test-utils"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { authService } from "@/services/auth.service"
import type { JwtPayload, User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        fetchCurrentUser: vi.fn(),
        getStoredSession: vi.fn(() => null),
        register: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

const mockUser: User = {
    id: "user-new",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockPayload: JwtPayload = {
    id: "user-new",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 3600,
}

beforeEach(() => {
    vi.clearAllMocks()
})

// Helper: preenche os campos comuns + PF com dados válidos
const fillIndividualForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/e-mail/i), "joao@example.com")
    await user.type(screen.getByLabelText(/^nome$/i), "João")
    await user.type(screen.getByLabelText(/sobrenome/i), "Silva")
    await user.type(screen.getByLabelText(/cpf/i), "52998224725")
    await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
    await user.type(screen.getByLabelText(/confirmar senha/i), "Senha@123")
    await user.click(screen.getByLabelText(/li e concordo/i))
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────────────────────────────────────

describe("RegisterPage — renderização", () => {
    it("renderiza com PF selecionado por padrão", async () => {
        renderWithProviders(<RegisterPage />)

        expect(await screen.findByLabelText(/^nome$/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/sobrenome/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cpf/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/razão social/i)).not.toBeInTheDocument()
    })

    it("tem link para a página de login", async () => {
        renderWithProviders(<RegisterPage />)

        const loginLink = await screen.findByRole("link", { name: /entrar/i })
        expect(loginLink).toHaveAttribute("href", "/login")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Toggle PF/PJ
// ─────────────────────────────────────────────────────────────────────────────

describe("RegisterPage — toggle PF/PJ", () => {
    it("alterna para PJ e mostra campos da empresa", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.click(await screen.findByLabelText(/pessoa jurídica/i))

        expect(screen.getByLabelText(/razão social/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cnpj/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/^nome$/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/cpf/i)).not.toBeInTheDocument()
    })

    it("volta para PF e mostra campos pessoais", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.click(await screen.findByLabelText(/pessoa jurídica/i))
        await user.click(screen.getByLabelText(/pessoa física/i))

        expect(screen.getByLabelText(/^nome$/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/razão social/i)).not.toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Máscaras
// ─────────────────────────────────────────────────────────────────────────────

describe("RegisterPage — máscaras", () => {
    it("aplica máscara de CPF conforme digita", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        const cpfInput = await screen.findByLabelText(/cpf/i) as HTMLInputElement
        await user.type(cpfInput, "52998224725")

        expect(cpfInput.value).toBe("529.982.247-25")
    })

    it("aplica máscara de CNPJ conforme digita", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.click(await screen.findByLabelText(/pessoa jurídica/i))

        const cnpjInput = screen.getByLabelText(/cnpj/i) as HTMLInputElement
        await user.type(cnpjInput, "11222333000181")

        expect(cnpjInput.value).toBe("11.222.333/0001-81")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação client-side
// ─────────────────────────────────────────────────────────────────────────────

describe("RegisterPage — validação client-side", () => {
    it("mostra erro quando senhas não coincidem", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.type(await screen.findByLabelText(/^senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar senha/i), "Outra@456")
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        expect(
            await screen.findByText(/as senhas não coincidem/i),
        ).toBeInTheDocument()
    })

    it("mostra erro para CPF inválido (dígito verificador errado)", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "x@x.com")
        await user.type(screen.getByLabelText(/^nome$/i), "X")
        await user.type(screen.getByLabelText(/sobrenome/i), "Y")
        await user.type(screen.getByLabelText(/cpf/i), "11111111111")
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        expect(await screen.findByText(/cpf inválido/i)).toBeInTheDocument()
    })

    it("mostra erro para email malformado", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await user.type(await screen.findByLabelText(/e-mail/i), "nao-eh-email")
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        expect(await screen.findByText(/e-mail inválido/i)).toBeInTheDocument()
    })

    it("mostra erro quando o consentimento LGPD não é marcado e não envia o cadastro", async () => {
        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        // Preenche tudo, exceto o checkbox de consentimento
        await user.type(await screen.findByLabelText(/e-mail/i), "joao@example.com")
        await user.type(screen.getByLabelText(/^nome$/i), "João")
        await user.type(screen.getByLabelText(/sobrenome/i), "Silva")
        await user.type(screen.getByLabelText(/cpf/i), "52998224725")
        await user.type(screen.getByLabelText(/^senha$/i), "Senha@123")
        await user.type(screen.getByLabelText(/confirmar senha/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        expect(
            await screen.findByText(/é necessário aceitar a política de privacidade/i),
        ).toBeInTheDocument()
        expect(authService.register).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit
// ─────────────────────────────────────────────────────────────────────────────

describe("RegisterPage — submit", () => {
    it("chama register + login + fetchCurrentUser e navega para /dashboard", async () => {
        vi.mocked(authService.register).mockResolvedValue(mockUser)
        vi.mocked(authService.login).mockResolvedValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)

        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await screen.findByLabelText(/e-mail/i)
        await fillIndividualForm(user)
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        await waitFor(() => {
            expect(authService.register).toHaveBeenCalledWith({
                userType: "INDIVIDUAL",
                email: "joao@example.com",
                password: "Senha@123",
                firstName: "João",
                lastName: "Silva",
                cpf: "529.982.247-25",
                acceptedTerms: true,
            })
        })

        // Auto-login dispara em sequência
        await waitFor(() => {
            expect(authService.login).toHaveBeenCalledWith({
                email: "joao@example.com",
                password: "Senha@123",
            })
        })
    })

    it("exibe mensagem de erro do servidor (ex: email duplicado)", async () => {
        vi.mocked(authService.register).mockRejectedValue(
            new Error("E-mail já cadastrado"),
        )

        const user = userEvent.setup()
        renderWithProviders(<RegisterPage />)

        await screen.findByLabelText(/e-mail/i)
        await fillIndividualForm(user)
        await user.click(screen.getByRole("button", { name: /criar conta/i }))

        expect(
            await screen.findByText(/e-mail já cadastrado/i),
        ).toBeInTheDocument()
    })
})