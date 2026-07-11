import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { Header } from "@/components/layout/Header"
import { authService } from "@/services/auth.service"
import type { User } from "@/types/auth.types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

// WarningBadge (useFiringAlerts) e NotificationDropdown (useNotifications)
// disparam queries via TanStack Query — precisam dos services mockados.
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

vi.mock("@/services/notification.service", () => ({
    notificationService: {
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        deleteAll: vi.fn(),
    },
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
 * Envolve o Header com QueryClientProvider.
 * O renderWithProviders já provê AuthProvider + MemoryRouter + ThemeProvider,
 * então só precisamos do QCP adicional.
 */
const renderHeader = (onMenuClick = vi.fn()) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return renderWithProviders(
        <QueryClientProvider client={queryClient}>
            <Header onMenuClick={onMenuClick} />
        </QueryClientProvider>,
    )
}

describe("Header — renderização", () => {
    it("renderiza botão hamburger", () => {
        renderHeader()

        expect(
            screen.getByRole("button", { name: /abrir menu/i }),
        ).toBeInTheDocument()
    })

    it("renderiza o ThemeToggle", () => {
        renderHeader()

        expect(
            screen.getByRole("button", { name: /tema atual/i }),
        ).toBeInTheDocument()
    })

    it("renderiza o UserMenu com dados do usuário autenticado", async () => {
        renderHeader()

        expect(await screen.findByText("João Silva")).toBeInTheDocument()
    })
})

describe("Header — interação", () => {
    it("chama onMenuClick ao clicar no hamburger", async () => {
        const onMenuClick = vi.fn()
        const user = userEvent.setup()

        renderHeader(onMenuClick)

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))

        expect(onMenuClick).toHaveBeenCalledTimes(1)
    })
})