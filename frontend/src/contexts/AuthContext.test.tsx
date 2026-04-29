import { describe, it, expect, beforeEach, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { authService } from "@/services/auth.service"
import type { User, JwtPayload } from "@/types/auth"

// useNavigate precisa de um Router no contexto — MemoryRouter resolve isso.
// O mock abaixo evita erros de "navigate is not a function" nos testes
// sem depender de um router real.
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router-dom")>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        fetchCurrentUser: vi.fn(),
        getStoredSession: vi.fn(),
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
)

beforeEach(() => {
    vi.clearAllMocks()
})

describe("AuthProvider — boot", () => {
    it("inicia como não autenticado quando não há sessão salva", async () => {
        vi.mocked(authService.getStoredSession).mockReturnValue(null)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.user).toBeNull()
    })

    it("hidrata o user quando há sessão válida no storage", async () => {
        vi.mocked(authService.getStoredSession).mockReturnValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.user?.email).toBe("test@example.com")
    })

    it("limpa estado quando hidratação falha (token revogado)", async () => {
        vi.mocked(authService.getStoredSession).mockReturnValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockRejectedValue(
            new Error("Unauthorized"),
        )

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toBeNull()
        expect(result.current.isAuthenticated).toBe(false)
    })
})

describe("AuthProvider — login", () => {
    it("autentica o user em caso de sucesso", async () => {
        vi.mocked(authService.getStoredSession).mockReturnValue(null)
        vi.mocked(authService.login).mockResolvedValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)

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
        vi.mocked(authService.getStoredSession).mockReturnValue(null)
        vi.mocked(authService.login).mockRejectedValue(
            new Error("Credenciais inválidas"),
        )

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await expect(
            act(async () => {
                await result.current.login({ email: "x@x.com", password: "errada" })
            }),
        ).rejects.toThrow("Credenciais inválidas")

        expect(result.current.isAuthenticated).toBe(false)
    })
})

describe("AuthProvider — logout", () => {
    it("limpa o user state após logout", async () => {
        vi.mocked(authService.getStoredSession).mockReturnValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)
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
        vi.mocked(authService.getStoredSession).mockReturnValue(mockPayload)
        vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
        })

        expect(result.current.user).toBeNull()
        expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true })
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