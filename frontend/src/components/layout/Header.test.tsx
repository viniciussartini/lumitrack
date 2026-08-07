import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { Header } from "@/components/layout/Header"
import { authService } from "@/services/auth.service"
import { useRealtime } from "@/contexts/RealtimeContext"
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
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
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

// Header não é envolvido por um RealtimeProvider neste teste (isso é papel
// do AppShell) — useRealtime() cai no valor default do contexto
// (isConnected: false); mockamos o módulo pra poder simular "conectado"
// num teste específico.
vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtime: vi.fn(() => ({ readingsByMeterId: {}, isConnected: false })),
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
    vi.mocked(useRealtime).mockReturnValue({ readingsByMeterId: {}, isConnected: false })
})

/**
 * Envolve o Header com QueryClientProvider.
 * O renderWithProviders já provê AuthProvider + MemoryRouter + ThemeProvider,
 * então só precisamos do QCP adicional.
 */
const renderHeader = (initialEntries = ["/dashboard"], onMenuClick = vi.fn()) => {
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
        { initialEntries },
    )
}

describe("Header — renderização", () => {
    it("renderiza botão hamburger", () => {
        renderHeader()

        expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument()
    })

    it("não renderiza ThemeToggle nem UserMenu — passaram para a Sidebar (#135)", async () => {
        renderHeader()
        await screen.findByRole("heading", { level: 1 })

        expect(screen.queryByRole("button", { name: /tema atual/i })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /menu do usuário/i })).not.toBeInTheDocument()
    })

    it("mostra a saudação com o nome do usuário no Painel", async () => {
        renderHeader(["/dashboard"])

        expect(
            await screen.findByRole("heading", { level: 1, name: "Olá, João!" }),
        ).toBeInTheDocument()
        expect(screen.getByText("Painel geral")).toBeInTheDocument()
    })

    it("mostra o kicker e o título da rota atual fora do Painel", async () => {
        renderHeader(["/distribuidoras"])

        expect(
            await screen.findByRole("heading", { level: 1, name: "Distribuidoras" }),
        ).toBeInTheDocument()
        expect(screen.getByText("Catálogo")).toBeInTheDocument()
    })

    it('mostra "Dados ao vivo" só quando o SSE está conectado', async () => {
        vi.mocked(useRealtime).mockReturnValue({ readingsByMeterId: {}, isConnected: true })

        renderHeader(["/dashboard"])
        await screen.findByRole("heading", { level: 1 })

        expect(screen.getByText(/dados ao vivo/i)).toBeInTheDocument()
    })

    it('não mostra "Dados ao vivo" quando o SSE está desconectado', async () => {
        renderHeader(["/dashboard"])
        await screen.findByRole("heading", { level: 1 })

        expect(screen.queryByText(/dados ao vivo/i)).not.toBeInTheDocument()
    })
})

describe("Header — interação", () => {
    it("chama onMenuClick ao clicar no hamburger", async () => {
        const onMenuClick = vi.fn()
        const user = userEvent.setup()

        renderHeader(["/dashboard"], onMenuClick)

        await user.click(screen.getByRole("button", { name: /abrir menu/i }))

        expect(onMenuClick).toHaveBeenCalledTimes(1)
    })
})
