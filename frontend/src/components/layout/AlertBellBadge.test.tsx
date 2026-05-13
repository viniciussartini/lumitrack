import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AlertBellBadge } from "@/components/layout/AlertBellBadge"
import { alertService } from "@/services/alert.service"
import type { Alert } from "@/types/alert.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        listGlobal: vi.fn(),
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
        update: vi.fn(),
        markAsRead: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

const renderBadge = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AlertBellBadge />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Contagem por estado
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertBellBadge — contagem", () => {
    it("NÃO renderiza badge quando há 0 não-lidos", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: null }), // ativo
            makeAlert({
                id: "alert-2",
                triggeredAt: "2025-11-10T12:00:00.000Z",
                readAt: "2025-11-11T08:30:00.000Z", // lido
            }),
        ])

        renderBadge()

        await waitFor(() => {
            expect(
                screen.getByTestId("alert-bell-badge"),
            ).toHaveAttribute("data-unread-count", "0")
        })

        expect(screen.queryByTestId("alert-bell-badge-count")).toBeNull()
    })

    it("renderiza badge com 1 quando há 1 não-lido", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "alert-1",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
        ])

        renderBadge()

        const count = await screen.findByTestId("alert-bell-badge-count")
        expect(count).toHaveTextContent("1")
    })

    it("renderiza badge com contagem quando há N não-lidos", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "alert-1",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
            makeAlert({
                id: "alert-2",
                triggeredAt: "2025-11-10T13:00:00.000Z",
            }),
            makeAlert({
                id: "alert-3",
                triggeredAt: "2025-11-10T14:00:00.000Z",
            }),
        ])

        renderBadge()

        const count = await screen.findByTestId("alert-bell-badge-count")
        expect(count).toHaveTextContent("3")
    })

    it("renderiza '99+' quando há 100+ não-lidos", async () => {
        // Cria 105 alertas todos disparados-não-lidos
        const alerts = Array.from({ length: 105 }, (_, i) =>
            makeAlert({
                id: `alert-${i}`,
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
        )
        vi.mocked(alertService.listGlobal).mockResolvedValue(alerts)

        renderBadge()

        const count = await screen.findByTestId("alert-bell-badge-count")
        expect(count).toHaveTextContent("99+")
    })

    it("ignora alertas ativos (não disparados) na contagem", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "ativo-1", triggeredAt: null }),
            makeAlert({ id: "ativo-2", triggeredAt: null }),
            makeAlert({
                id: "disparado",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
        ])

        renderBadge()

        const count = await screen.findByTestId("alert-bell-badge-count")
        expect(count).toHaveTextContent("1")
    })

    it("ignora alertas já lidos na contagem", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "lido",
                triggeredAt: "2025-11-10T12:00:00.000Z",
                readAt: "2025-11-11T08:30:00.000Z",
            }),
            makeAlert({
                id: "nao-lido",
                triggeredAt: "2025-11-10T13:00:00.000Z",
            }),
        ])

        renderBadge()

        const count = await screen.findByTestId("alert-bell-badge-count")
        expect(count).toHaveTextContent("1")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navegação
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertBellBadge — navegação", () => {
    it("link aponta para /alertas?triggered=true", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])

        renderBadge()

        const link = await screen.findByTestId("alert-bell-badge")
        expect(link).toHaveAttribute("href", "/alertas?triggered=true")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Acessibilidade
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertBellBadge — acessibilidade", () => {
    it("aria-label='Alertas — nenhum pendente' quando count=0", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])

        renderBadge()

        await waitFor(() => {
            expect(screen.getByTestId("alert-bell-badge")).toHaveAttribute(
                "aria-label",
                "Alertas — nenhum pendente",
            )
        })
    })

    it("aria-label singular quando count=1", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" }),
        ])

        renderBadge()

        await waitFor(() => {
            expect(screen.getByTestId("alert-bell-badge")).toHaveAttribute(
                "aria-label",
                "1 alerta não lido",
            )
        })
    })

    it("aria-label plural quando count > 1", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "a1",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
            makeAlert({
                id: "a2",
                triggeredAt: "2025-11-10T13:00:00.000Z",
            }),
        ])

        renderBadge()

        await waitFor(() => {
            expect(screen.getByTestId("alert-bell-badge")).toHaveAttribute(
                "aria-label",
                "2 alertas não lidos",
            )
        })
    })
})