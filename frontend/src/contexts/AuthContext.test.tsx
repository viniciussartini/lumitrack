import { describe, it, expect, beforeEach, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { toast } from "sonner"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { authService } from "@/services/auth.service"
import { scheduleProactiveRefresh, cancelProactiveRefresh } from "@/lib/sessionRefresh"
import { queryClient } from "@/lib/queryClient"
import { storage, STORAGE_KEYS } from "@/lib/storage"
import type { User } from "@/types/auth.types"

// useNavigate precisa de um Router no contexto — MemoryRouter resolve isso.
// O mock abaixo evita erros de "navigate is not a function" nos testes
// sem depender de um router real.
const mockNavigate = vi.fn()
vi.mock("react-router", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router")>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        demoLogin: vi.fn(),
        verifyMfaLogin: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
        register: vi.fn(),
    },
}))

vi.mock("@/lib/sessionRefresh", () => ({
    scheduleProactiveRefresh: vi.fn(),
    cancelProactiveRefresh: vi.fn(),
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
)

beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
})

describe("AuthProvider — boot", () => {
    it("inicia como não autenticado quando não há sessão ativa (/auth/me falha)", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.user).toBeNull()
    })

    it("hidrata o user quando há sessão ativa (/auth/me retorna o usuário)", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.user?.email).toBe("test@example.com")
    })
})

describe("AuthProvider — login", () => {
    it("autentica o user em caso de sucesso", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.login).mockResolvedValue({ user: mockUser })

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.login({
                email: "test@example.com",
                password: "Senha@123",
            })
        })

        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.user?.id).toBe("user-123")
    })

    it("propaga erro com mensagem amigável quando credenciais falham", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.login).mockRejectedValue(new Error("Credenciais inválidas"))

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await expect(
            act(async () => {
                await result.current.login({ email: "x@x.com", password: "errada" })
            }),
        ).rejects.toThrow("Credenciais inválidas")

        expect(result.current.isAuthenticated).toBe(false)
    })

    it("NÃO autentica quando o login responde mfaRequired — devolve o resultado para o caller", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.login).mockResolvedValue({
            mfaRequired: true,
            mfaToken: "mfa-token-123",
        })

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        let loginResult
        await act(async () => {
            loginResult = await result.current.login({
                email: "test@example.com",
                password: "Senha@123",
            })
        })

        expect(loginResult).toEqual({ mfaRequired: true, mfaToken: "mfa-token-123" })
        expect(result.current.isAuthenticated).toBe(false)
    })
})

// Mesmo contrato de login, sem credenciais — cobre só o que difere (chamada
// a demoLogin em vez de login); os ramos de mfaRequired e erro já são
// exercitados de forma equivalente acima.
describe("AuthProvider — demoLogin", () => {
    it("autentica o user em caso de sucesso", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.demoLogin).mockResolvedValue({ user: mockUser })

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.demoLogin("residential")
        })

        expect(authService.demoLogin).toHaveBeenCalledWith("residential")
        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.user?.id).toBe("user-123")
    })

    it("propaga erro com mensagem amigável quando o backend recusa", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.demoLogin).mockRejectedValue(new Error("Acesso negado"))

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await expect(
            act(async () => {
                await result.current.demoLogin("commercial")
            }),
        ).rejects.toThrow("Acesso negado")

        expect(result.current.isAuthenticated).toBe(false)
    })
})

describe("AuthProvider — completeMfaLogin", () => {
    it("autentica o user após o segundo passo do MFA", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.verifyMfaLogin).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.completeMfaLogin({
                mfaToken: "mfa-token-123",
                code: "123456",
            })
        })

        expect(authService.verifyMfaLogin).toHaveBeenCalledWith({
            mfaToken: "mfa-token-123",
            code: "123456",
        })
        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.user?.id).toBe("user-123")
    })

    it("propaga erro com mensagem amigável quando o código é inválido", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.verifyMfaLogin).mockRejectedValue(new Error("Código inválido"))

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await expect(
            act(async () => {
                await result.current.completeMfaLogin({
                    mfaToken: "mfa-token-123",
                    code: "000000",
                })
            }),
        ).rejects.toThrow("Código inválido")

        expect(result.current.isAuthenticated).toBe(false)
    })
})

describe("AuthProvider — refreshUser", () => {
    it("rebusca o usuário via getCurrentUser e atualiza o estado", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValueOnce(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        const updatedUser = { ...mockUser, mfaEnabled: true }
        vi.mocked(authService.getCurrentUser).mockResolvedValueOnce(updatedUser)

        await act(async () => {
            await result.current.refreshUser()
        })

        expect(result.current.user?.mfaEnabled).toBe(true)
    })
})

describe("AuthProvider — logout", () => {
    it("limpa o user state após logout", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
        vi.mocked(authService.logout).mockResolvedValue()

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            await result.current.logout()
        })

        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.user).toBeNull()
    })
})

describe("AuthProvider — evento lumitrack:unauthorized", () => {
    it("desautentica e navega para /login ao receber o evento do interceptor", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
        })

        expect(result.current.user).toBeNull()
        expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true })
    })
})

describe("AuthProvider — refresh proativo", () => {
    it("agenda refresh após login bem-sucedido", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        vi.mocked(authService.login).mockResolvedValue({ user: mockUser })

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.login({ email: "test@example.com", password: "Senha@123" })
        })

        expect(vi.mocked(scheduleProactiveRefresh)).toHaveBeenCalled()
    })

    it("agenda refresh no bootstrap quando há sessão ativa", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        expect(vi.mocked(scheduleProactiveRefresh)).toHaveBeenCalled()
    })

    it("cancela o refresh ao fazer logout", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
        vi.mocked(authService.logout).mockResolvedValue()

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            await result.current.logout()
        })

        expect(vi.mocked(cancelProactiveRefresh)).toHaveBeenCalled()
    })

    it("cancela o refresh ao receber evento lumitrack:unauthorized", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
        })

        expect(vi.mocked(cancelProactiveRefresh)).toHaveBeenCalled()
    })
})

describe("AuthProvider — isolamento entre sessões", () => {
    const PROPERTIES_KEY = ["properties", "list", 1, 10] as const
    const otherUser: User = { ...mockUser, id: "user-456", email: "outro@example.com" }

    // Simula o que a conta anterior deixou no navegador: dados em cache do
    // TanStack Query (compartilhado pela aba inteira) e a propriedade escolhida.
    const leaveResiduesOfPreviousUser = (): void => {
        queryClient.setQueryData(PROPERTIES_KEY, [{ id: "propriedade-da-conta-anterior" }])
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, "propriedade-da-conta-anterior")
    }

    const expectNoResidues = (): void => {
        expect(queryClient.getQueryData(PROPERTIES_KEY)).toBeUndefined()
        expect(storage.get(STORAGE_KEYS.SELECTED_PROPERTY)).toBeNull()
        // Os toasts da conta anterior mostram texto dela e sobrevivem à navegação.
        expect(dismissSpy).toHaveBeenCalled()
    }

    const dismissSpy = vi.spyOn(toast, "dismiss")

    beforeEach(() => {
        dismissSpy.mockClear()
    })

    const renderUnauthenticated = async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        const rendered = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(rendered.result.current.isLoading).toBe(false))
        return rendered
    }

    it("logout descarta o cache e a propriedade selecionada", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
        vi.mocked(authService.logout).mockResolvedValue(undefined)
        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
        leaveResiduesOfPreviousUser()

        await act(async () => {
            await result.current.logout()
        })

        expectNoResidues()
    })

    it("sessão encerrada pelo servidor (lumitrack:unauthorized) descarta o cache", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
        leaveResiduesOfPreviousUser()

        await act(async () => {
            window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
        })

        expectNoResidues()
    })

    it("login não herda o cache de uma sessão anterior que não passou pelo logout", async () => {
        const { result } = await renderUnauthenticated()
        leaveResiduesOfPreviousUser()
        vi.mocked(authService.login).mockResolvedValue({ user: otherUser })

        await act(async () => {
            await result.current.login({ email: otherUser.email, password: "Senha@123" })
        })

        expectNoResidues()
        expect(result.current.user?.id).toBe("user-456")
    })

    it("login de demonstração não herda o cache da conta anterior", async () => {
        const { result } = await renderUnauthenticated()
        leaveResiduesOfPreviousUser()
        vi.mocked(authService.demoLogin).mockResolvedValue({ user: otherUser })

        await act(async () => {
            await result.current.demoLogin("commercial")
        })

        expectNoResidues()
    })

    it("login com MFA não herda o cache da conta anterior", async () => {
        const { result } = await renderUnauthenticated()
        leaveResiduesOfPreviousUser()
        vi.mocked(authService.verifyMfaLogin).mockResolvedValue(otherUser)

        await act(async () => {
            await result.current.completeMfaLogin({ mfaToken: "token", code: "123456" })
        })

        expectNoResidues()
    })

    it("login automático do cadastro não herda o cache da conta anterior", async () => {
        const { result } = await renderUnauthenticated()
        leaveResiduesOfPreviousUser()
        vi.mocked(authService.register).mockResolvedValue(otherUser)
        vi.mocked(authService.login).mockResolvedValue({ user: otherUser })

        await act(async () => {
            await result.current.register({
                email: otherUser.email,
                password: "Senha@123",
            } as Parameters<typeof result.current.register>[0])
        })

        expectNoResidues()
        expect(result.current.user?.id).toBe("user-456")
    })

    it("login que exige MFA ainda não troca de usuário, então preserva o cache", async () => {
        const { result } = await renderUnauthenticated()
        leaveResiduesOfPreviousUser()
        vi.mocked(authService.login).mockResolvedValue({ mfaRequired: true, mfaToken: "t" })

        await act(async () => {
            await result.current.login({ email: otherUser.email, password: "Senha@123" })
        })

        expect(queryClient.getQueryData(PROPERTIES_KEY)).toBeDefined()
    })
})

describe("AuthProvider — troca de sessão em outra aba", () => {
    const PROPERTIES_KEY = ["properties", "list", 1, 10] as const
    const otherUser: User = { ...mockUser, id: "user-456", email: "outro@example.com" }

    const otherTabChangedSession = async (): Promise<void> => {
        await act(async () => {
            window.dispatchEvent(
                new StorageEvent("storage", { key: STORAGE_KEYS.SESSION_SIGNAL, newValue: "x" }),
            )
        })
    }

    const renderAuthenticated = async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValueOnce(mockUser)
        const rendered = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(rendered.result.current.isAuthenticated).toBe(true))
        queryClient.setQueryData(PROPERTIES_KEY, [{ id: "propriedade-do-usuario-antigo" }])
        return rendered
    }

    it("outra aba entrou com outro usuário: esta aba descarta o cache e passa a usar o novo", async () => {
        const { result } = await renderAuthenticated()
        vi.mocked(authService.getCurrentUser).mockResolvedValue(otherUser)

        await otherTabChangedSession()

        await waitFor(() => expect(result.current.user?.id).toBe("user-456"))
        expect(queryClient.getQueryData(PROPERTIES_KEY)).toBeUndefined()
        expect(vi.mocked(scheduleProactiveRefresh)).toHaveBeenCalled()
    })

    it("outra aba saiu: esta aba descarta o cache e volta ao login", async () => {
        const { result } = await renderAuthenticated()
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)

        await otherTabChangedSession()

        await waitFor(() => expect(result.current.user).toBeNull())
        expect(queryClient.getQueryData(PROPERTIES_KEY)).toBeUndefined()
        expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true })
    })

    it("evento de storage de outra chave é ignorado", async () => {
        const { result } = await renderAuthenticated()

        await act(async () => {
            window.dispatchEvent(
                new StorageEvent("storage", { key: STORAGE_KEYS.THEME, newValue: "dark" }),
            )
        })

        expect(result.current.user?.id).toBe("user-123")
        expect(queryClient.getQueryData(PROPERTIES_KEY)).toBeDefined()
    })

    it("entrar nesta aba avisa as outras, e quem recebe o aviso não o repete", async () => {
        vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        vi.mocked(authService.login).mockResolvedValue({ user: otherUser })

        await act(async () => {
            await result.current.login({ email: otherUser.email, password: "Senha@123" })
        })
        const announced = storage.get(STORAGE_KEYS.SESSION_SIGNAL)
        expect(announced).not.toBeNull()

        vi.mocked(authService.getCurrentUser).mockResolvedValue(otherUser)
        await otherTabChangedSession()
        await waitFor(() => expect(vi.mocked(authService.getCurrentUser)).toHaveBeenCalledTimes(2))

        expect(storage.get(STORAGE_KEYS.SESSION_SIGNAL)).toBe(announced)
    })
})

describe("useAuth", () => {
    it("lança erro se usado fora do AuthProvider", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => renderHook(() => useAuth())).toThrow(
            /useAuth deve ser usado dentro de <AuthProvider>/,
        )
        consoleError.mockRestore()
    })
})
