import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, Link } from "react-router-dom"
import { render, screen, waitFor } from "@/tests/test-utils"
import { AppShell } from "@/components/layout/AppShell"
import { authService } from "@/services/auth.service"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import type { JwtPayload, User } from "@/types/auth"

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
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockPayload: JwtPayload = {
    id: "user-123",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 3600,
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getStoredSession).mockReturnValue(mockPayload)
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(mockUser)
})

/**
 * Renderiza o AppShell dentro de um router de teste com duas rotas-filho,
 * permitindo testar navegação entre elas (e o efeito de fechar o drawer).
 *
 * NÃO usamos o renderWithProviders padrão porque ele já provê MemoryRouter,
 * e aqui precisamos das tags <Routes>/<Route> aninhadas.
 */
const renderShell = (initialEntry = "/dashboard") =>
    render(
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
                                        <Link to="/distribuidoras">
                                            Ir para Distribuidoras
                                        </Link>
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
        </ThemeProvider>,
    )

describe("AppShell — renderização", () => {
    it("renderiza o conteúdo da rota filha (Outlet)", async () => {
        renderShell("/dashboard")

        expect(
            await screen.findByText("Conteúdo do Dashboard"),
        ).toBeInTheDocument()
    })

    it("renderiza Sidebar e Header", async () => {
        renderShell("/dashboard")

        // Sidebar tem aria-label="Navegação principal"
        expect(
            screen.getByRole("complementary", { name: /navegação principal/i }),
        ).toBeInTheDocument()

        // Header tem o botão hamburger
        expect(
            screen.getByRole("button", { name: /abrir menu/i }),
        ).toBeInTheDocument()
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

        // Abre o drawer
        await user.click(screen.getByRole("button", { name: /abrir menu/i }))

        // Navega para outra rota
        await user.click(screen.getByRole("link", { name: /ir para distribuidoras/i }))

        // Aguarda a navegação acontecer
        await waitFor(() => {
            expect(
                screen.getByText("Conteúdo de Distribuidoras"),
            ).toBeInTheDocument()
        })

        // Sidebar deve estar fechada
        const aside = screen.getByRole("complementary", {
            name: /navegação principal/i,
        })
        expect(aside.className).toMatch(/-translate-x-full/)
    })
})