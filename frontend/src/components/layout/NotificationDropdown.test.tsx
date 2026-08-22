import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { NotificationDropdown } from "@/components/layout/NotificationDropdown"
import { notificationService } from "@/services/notification.service"
import { authService } from "@/services/auth.service"
import type { Notification } from "@/types/notification.types"
import type { User } from "@/types/auth.types"

vi.mock("@/services/notification.service", () => ({
    notificationService: {
        list: vi.fn(),
        delete: vi.fn(),
        deleteAll: vi.fn(),
    },
}))

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
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

const NOTIFICATION_1: Notification = {
    id: "notif-1",
    alertId: "alert-1",
    alertName: "Geladeira fora da faixa",
    meterId: "meter-1",
    targetType: "DEVICE",
    targetPath: "/propriedades/prop-1",
    message: "Geladeira fora da faixa de potência",
    createdAt: "2026-08-21T19:00:00.000Z",
}

const NOTIFICATION_2: Notification = {
    id: "notif-2",
    alertId: "alert-2",
    alertName: "Ar-condicionado fora da faixa",
    meterId: "meter-2",
    targetType: "DEVICE",
    targetPath: "/propriedades/prop-1",
    message: "Bandeira tarifária alterada para vermelha",
    createdAt: "2026-08-21T19:05:00.000Z",
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
    vi.mocked(notificationService.deleteAll).mockResolvedValue(undefined)
})

/**
 * Mesmo padrão de `Header.test.tsx`: `renderWithProviders` já dá
 * AuthProvider + MemoryRouter + ThemeProvider; só falta o QueryClientProvider
 * (useNotifications/useDeleteAllNotifications rodam em cima de TanStack Query).
 */
const renderDropdown = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return renderWithProviders(
        <QueryClientProvider client={queryClient}>
            <NotificationDropdown />
        </QueryClientProvider>,
    )
}

const openDropdown = async (notifications: Notification[]) => {
    vi.mocked(notificationService.list).mockResolvedValue(notifications)
    const user = userEvent.setup()
    renderDropdown()
    await user.click(await screen.findByTestId("notification-bell"))
    await screen.findByTestId("notification-dropdown")
    return user
}

describe("NotificationDropdown — marcar todas como lidas", () => {
    it("mostra a ação quando há notificações", async () => {
        await openDropdown([NOTIFICATION_1, NOTIFICATION_2])

        expect(screen.getByRole("button", { name: /marcar todas como lidas/i })).toBeInTheDocument()
    })

    it("não mostra a ação quando a lista está vazia", async () => {
        await openDropdown([])

        expect(screen.getByText(/nenhuma notificação/i)).toBeInTheDocument()
        expect(
            screen.queryByRole("button", { name: /marcar todas como lidas/i }),
        ).not.toBeInTheDocument()
    })

    it("ao acionar, chama deleteAll e a lista esvazia", async () => {
        const user = await openDropdown([NOTIFICATION_1, NOTIFICATION_2])
        expect(screen.getByText(NOTIFICATION_1.message)).toBeInTheDocument()

        vi.mocked(notificationService.list).mockResolvedValue([])
        await user.click(screen.getByRole("button", { name: /marcar todas como lidas/i }))

        expect(notificationService.deleteAll).toHaveBeenCalledTimes(1)
        await screen.findByText(/nenhuma notificação/i)
        expect(screen.queryByText(NOTIFICATION_1.message)).not.toBeInTheDocument()
    })

    it("ao acionar, o badge do sino zera", async () => {
        const user = await openDropdown([NOTIFICATION_1, NOTIFICATION_2])
        expect(screen.getByTestId("notification-bell-count")).toHaveTextContent("2")

        vi.mocked(notificationService.list).mockResolvedValue([])
        await user.click(screen.getByRole("button", { name: /marcar todas como lidas/i }))

        await screen.findByText(/nenhuma notificação/i)
        expect(screen.queryByTestId("notification-bell-count")).not.toBeInTheDocument()
    })

    it("dropdown continua aberto após marcar todas como lidas", async () => {
        const user = await openDropdown([NOTIFICATION_1])

        vi.mocked(notificationService.list).mockResolvedValue([])
        await user.click(screen.getByRole("button", { name: /marcar todas como lidas/i }))

        expect(await screen.findByTestId("notification-dropdown")).toBeVisible()
    })

    it("é operável por teclado", async () => {
        await openDropdown([NOTIFICATION_1])

        const action = screen.getByRole("button", { name: /marcar todas como lidas/i })
        action.focus()
        expect(action).toHaveFocus()
    })
})
