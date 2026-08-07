import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, Link } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@/tests/test-utils"
import { AppShell } from "@/components/layout/AppShell"
import { authService } from "@/services/auth.service"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import type { User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

// WarningBadge usa useFiringAlerts() → precisamos do alertService mockado
vi.mock("@/services/alert.service", () => ({
    alertService: {
        list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
        firing: vi.fn().mockResolvedValue([]),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        patchEnabled: vi.fn(),
        delete: vi.fn(),
    },
}))

// NotificationDropdown usa useNotifications() → precisamos do notificationService mockado
vi.mock("@/services/notification.service", () => ({
    notificationService: {
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        deleteAll: vi.fn(),
    },
}))

// RealtimeProvider abre SSE via createAppStream — mockar pra evitar side
// effects em testes (conexão de rede real, timers pendentes).
vi.mock("@/lib/sse/appStream", () => ({
    createAppStream: vi.fn(() => () => {}),
}))

const mockUser: User = {
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

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
})

/**
 * Renderiza o AppShell dentro de um router de teste com duas rotas-filho,
 * permitindo testar navegação entre elas (e o efeito de fechar o drawer).
 *
 * NÃO usamos o renderWithProviders padrão porque ele já provê MemoryRouter,
 * e aqui precisamos das tags <Routes>/<Route> aninhadas.
 *
 * Envolve com QueryClientProvider porque o AlertBellBadge (adicionado no
 * Header no PR2) faz queries via TanStack Query.
 */
const renderShell = (initialEntry = "/dashboard") => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <MemoryRouter initialEntries={[initialEntry]}>
                    <AuthProvider>
                        <Routes>
                            <Route element={<AppShell />}>
                                <Route
                                    path="/dashboard"
                                    element={
                                        <div>
                                            <p>Conteúdo do Dashboard</p>
                                            <Link to="/distribuidoras">Ir para Distribuidoras</Link>
                                        </div>
                                    }
                                />
                                <Route
                                    path="/distribuidoras"
                                    element={<p>Conteúdo de Distribuidoras</p>}
                                />
                            </Route>
                        </Routes>
                    </AuthProvider>
                </MemoryRouter>
            </ThemeProvider>
        </QueryClientProvider>,
    )
}

describe("AppShell — renderização", () => {
    it("renderiza o conteúdo da rota filha (Outlet)", async () => {
        renderShell("/dashboard")

        expect(await screen.findByText("Conteúdo do Dashboard")).toBeInTheDocument()
    })

    it("renderiza Sidebar e Header", async () => {
        renderShell("/dashboard")

        expect(
            screen.getByRole("complementary", { name: /navegação principal/i }),
        ).toBeInTheDocument()

        expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument()
    })
})

describe("AppShell — drawer mobile", () => {
    it("começa com a sidebar fechada (translate-x-full)", () => {
        renderShell("/dashboard")

        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/-translate-x-full/)
    })

    it("abre a sidebar ao clicar no hamburger", async () => {
        const user = userEvent.setup()
        renderShell("/dashboard")

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))

        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/translate-x-0/)
    })

    it("fecha a sidebar ao clicar no botão de fechar", async () => {
        const user = userEvent.setup()
        renderShell("/dashboard")

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))
        await user.click(screen.getByRole("button", { name: /fechar menu/i }))

        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/-translate-x-full/)
    })

    it("fecha a sidebar ao pressionar Escape", async () => {
        const user = userEvent.setup()
        renderShell("/dashboard")

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))
        await user.keyboard("{Escape}")

        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/-translate-x-full/)
    })

    it("fecha a sidebar ao mudar de rota", async () => {
        const user = userEvent.setup()
        renderShell("/dashboard")

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))
        await user.click(screen.getByRole("link", { name: /ir para distribuidoras/i }))

        await waitFor(() => {
            expect(screen.getByText("Conteúdo de Distribuidoras")).toBeInTheDocument()
        })

        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/-translate-x-full/)
    })
})
