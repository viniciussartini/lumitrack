import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { AuthProvider } from "@/contexts/AuthContext"
import { SecurityPage } from "@/pages/settings/SecurityPage"
import { authService } from "@/services/auth.service"
import { toast } from "sonner"
import type { User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        verifyMfaLogin: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
        register: vi.fn(),
        refresh: vi.fn(),
        mfaSetup: vi.fn(),
        mfaVerifySetup: vi.fn(),
        mfaDisable: vi.fn(),
    },
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

const mockUserMfaOff: User = {
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

const mockUserMfaOn: User = { ...mockUserMfaOff, mfaEnabled: true }

const renderPage = () => {
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
                    <SecurityPage />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("SecurityPage — status", () => {
    it("mostra 'Desativada' e o botão Ativar quando o user não tem MFA", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOff)
        renderPage()

        expect(await screen.findByText(/desativada/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /ativar 2fa/i })).toBeInTheDocument()
    })

    it("mostra 'Ativada' e o botão Desativar quando o user já tem MFA", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOn)
        renderPage()

        expect(await screen.findByText(/^ativada/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /desativar 2fa/i })).toBeInTheDocument()
    })
})

describe("SecurityPage — fluxo de setup", () => {
    it("busca o QR code ao clicar em Ativar e mostra o form de confirmação", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOff)
        vi.mocked(authService.mfaSetup).mockResolvedValue({
            secret: "SECRET123",
            qrCodeDataUrl: "data:image/png;base64,xyz",
        })

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /ativar 2fa/i }))

        expect(authService.mfaSetup).toHaveBeenCalled()
        expect(await screen.findByAltText(/qr code/i)).toHaveAttribute(
            "src",
            "data:image/png;base64,xyz",
        )
        expect(screen.getByText("SECRET123")).toBeInTheDocument()
        expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument()
    })

    it("confirma o código, mostra os backup codes e ativa o MFA", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOff)
        vi.mocked(authService.mfaSetup).mockResolvedValue({
            secret: "SECRET123",
            qrCodeDataUrl: "data:image/png;base64,xyz",
        })
        const backupCodes = Array.from({ length: 10 }, (_, i) => `CODE${i}-CODE${i}`)
        vi.mocked(authService.mfaVerifySetup).mockResolvedValue({ backupCodes })

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /ativar 2fa/i }))
        await user.type(await screen.findByLabelText(/código de verificação/i), "123456")
        await user.click(screen.getByRole("button", { name: /verificar e ativar/i }))

        expect(authService.mfaVerifySetup).toHaveBeenCalledWith({
            secret: "SECRET123",
            code: "123456",
        })
        expect(await screen.findByText(backupCodes[0])).toBeInTheDocument()
        expect(vi.mocked(toast.success)).toHaveBeenCalled()

        // Concluir volta ao estado idle
        await user.click(screen.getByRole("button", { name: /concluir/i }))
        expect(
            screen.queryByRole("button", { name: /concluir/i }),
        ).not.toBeInTheDocument()
    })

    it("mostra toast de erro quando mfaSetup falha", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOff)
        vi.mocked(authService.mfaSetup).mockRejectedValue(new Error("Falha ao iniciar"))

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /ativar 2fa/i }))

        await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled())
    })
})

describe("SecurityPage — fluxo de disable", () => {
    it("desativa o MFA com senha + código válidos", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOn)
        vi.mocked(authService.mfaDisable).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /desativar 2fa/i }))
        await user.type(screen.getByLabelText(/senha atual/i), "Senha@123")
        await user.type(screen.getByLabelText(/código de verificação/i), "123456")
        await user.click(screen.getByRole("button", { name: /^desativar 2fa$/i }))

        await waitFor(() => {
            expect(authService.mfaDisable).toHaveBeenCalledWith({
                password: "Senha@123",
                code: "123456",
            })
        })
        expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })

    it("mostra erro inline quando a senha ou código estão incorretos", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOn)
        vi.mocked(authService.mfaDisable).mockRejectedValue(new Error("Senha incorreta"))

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /desativar 2fa/i }))
        await user.type(screen.getByLabelText(/senha atual/i), "errada")
        await user.type(screen.getByLabelText(/código de verificação/i), "123456")
        await user.click(screen.getByRole("button", { name: /^desativar 2fa$/i }))

        expect(await screen.findByText(/senha incorreta/i)).toBeInTheDocument()
    })

    it("cancela e volta ao estado idle", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserMfaOn)

        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /desativar 2fa/i }))
        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(screen.queryByLabelText(/senha atual/i)).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /desativar 2fa/i })).toBeInTheDocument()
    })
})
