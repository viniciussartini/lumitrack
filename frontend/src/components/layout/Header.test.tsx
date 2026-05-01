import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { Header } from "@/components/layout/Header"
import { authService } from "@/services/auth.service"
import type { JwtPayload, User } from "@/types/auth.types"

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

describe("Header — renderização", () => {
    it("renderiza botão hamburger", () => {
        renderWithProviders(<Header onMenuClick={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: /abrir menu/i }),
        ).toBeInTheDocument()
    })

    it("renderiza o ThemeToggle", () => {
        renderWithProviders(<Header onMenuClick={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: /tema atual/i }),
        ).toBeInTheDocument()
    })

    it("renderiza o UserMenu com dados do usuário autenticado", async () => {
        renderWithProviders(<Header onMenuClick={vi.fn()} />)

        // UserMenu hidrata async via AuthContext
        expect(await screen.findByText("João Silva")).toBeInTheDocument()
    })
})

describe("Header — interação", () => {
    it("chama onMenuClick ao clicar no hamburger", async () => {
        const onMenuClick = vi.fn()
        const user = userEvent.setup()

        renderWithProviders(<Header onMenuClick={onMenuClick} />)

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))

        expect(onMenuClick).toHaveBeenCalledTimes(1)
    })
})