import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { AlertsPage } from "@/pages/alert/AlertsPage"
import { alertService } from "@/services/alert.service"
import { propertyService } from "@/services/property.service"
import type { Alert } from "@/types/alert.types"
import type { Property } from "@/types/property.types"

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
    },
}))

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

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

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

/**
 * Render helper. Aceita initialEntries para testar URL sync.
 *
 * O LocationSpy expõe o location atual via data-attributes — permite
 * assertar mudanças de URL após clicks no filtro sem precisar mockar
 * setSearchParams.
 */
const renderPage = (initialPath = "/alertas") => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route
                        path="/alertas"
                        element={
                            <>
                                <AlertsPage />
                                <LocationSpy />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

const LocationSpy = () => {
    const location = useLocation()
    return (
        <div
            data-testid="location-spy"
            data-pathname={location.pathname}
            data-search={location.search}
        />
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.list).mockResolvedValue([])
})

// ─────────────────────────────────────────────────────────────────────────────
// Header e estados básicos
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — header", () => {
    beforeEach(() => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])
    })

    it("renderiza heading h1 'Alertas'", () => {
        renderPage()

        expect(
            screen.getByRole("heading", { level: 1, name: /^alertas$/i }),
        ).toBeInTheDocument()
    })

    it("renderiza descrição da página", () => {
        renderPage()

        expect(
            screen.getByText(/limites de consumo configurados/i),
        ).toBeInTheDocument()
    })
})

describe("AlertsPage — loading", () => {
    it("renderiza skeleton enquanto a query carrega", () => {
        vi.mocked(alertService.listGlobal).mockImplementation(
            () => new Promise(() => {}),
        )

        renderPage()

        expect(screen.getByTestId("alerts-page-skeleton")).toBeInTheDocument()
    })

    it("NÃO renderiza filtro durante loading", () => {
        vi.mocked(alertService.listGlobal).mockImplementation(
            () => new Promise(() => {}),
        )

        renderPage()

        expect(
            screen.queryByTestId("alert-triggered-filter"),
        ).toBeNull()
    })
})

describe("AlertsPage — erro", () => {
    it("renderiza alerta com a mensagem do erro", async () => {
        vi.mocked(alertService.listGlobal).mockRejectedValue(
            new Error("Falha de rede"),
        )

        renderPage()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/falha de rede/i)
    })

    it("renderiza mensagem default quando o erro não é Error", async () => {
        vi.mocked(alertService.listGlobal).mockRejectedValue(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "string crua" as any,
        )

        renderPage()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/não foi possível carregar/i)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty global vs empty filtrado
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — empty global", () => {
    beforeEach(() => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])
    })

    it("renderiza EmptyState com copy do estado global vazio", async () => {
        renderPage()

        expect(
            await screen.findByText(/nenhum alerta configurado/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/crie alertas de consumo nas páginas/i),
        ).toBeInTheDocument()
    })

    it("NÃO mostra a tabela", async () => {
        renderPage()

        await screen.findByText(/nenhum alerta configurado/i)

        expect(screen.queryByTestId("alert-table")).toBeNull()
    })
})

describe("AlertsPage — empty filtrado", () => {
    it("quando filtro=triggered e há ativos mas nenhum disparado", async () => {
        // Tem 2 alertas, ambos ativos. Filtro de "disparados" deve esvaziar.
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1" }),
            makeAlert({ id: "alert-2" }),
        ])

        renderPage("/alertas?triggered=true")

        expect(
            await screen.findByText(/nenhum alerta neste filtro/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/você não tem alertas disparados no momento/i),
        ).toBeInTheDocument()
    })

    it("quando filtro=ativo e tudo já disparou", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "alert-1",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
        ])

        renderPage("/alertas?triggered=false")

        expect(
            await screen.findByText(/nenhum alerta neste filtro/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/você não tem alertas ativos no momento/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tabela e ordenação
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — tabela", () => {
    it("renderiza a tabela quando há alertas", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([makeAlert()])

        renderPage()

        expect(await screen.findByTestId("alert-table")).toBeInTheDocument()
    })

    it("renderiza a coluna 'Alvo' (showTarget=true)", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([makeAlert()])

        renderPage()

        await screen.findByTestId("alert-table")
        expect(
            screen.getByRole("columnheader", { name: /alvo/i }),
        ).toBeInTheDocument()
    })

    it("ordenação: TRIGGERED não-lido > ACTIVE > READ", async () => {
        const triggered = makeAlert({
            id: "triggered",
            triggeredAt: "2025-11-10T12:00:00.000Z",
        })
        const active = makeAlert({ id: "active" })
        const read = makeAlert({
            id: "read",
            triggeredAt: "2025-11-09T12:00:00.000Z",
            readAt: "2025-11-09T13:00:00.000Z",
        })

        vi.mocked(alertService.listGlobal).mockResolvedValue([
            read,
            active,
            triggered,
        ])

        renderPage()

        await screen.findByTestId("alert-table")

        const rows = screen.getAllByRole("row").slice(1) // slice(1) descarta o header
        expect(rows[0]).toHaveAttribute(
            "data-testid",
            "alert-row-triggered",
        )
        expect(rows[1]).toHaveAttribute("data-testid", "alert-row-active")
        expect(rows[2]).toHaveAttribute("data-testid", "alert-row-read")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Lookup de Property
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — lookup de Property na coluna Alvo", () => {
    it("resolve nome humano quando Property está no lookup", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ propertyId: "prop-1" }),
        ])
        vi.mocked(propertyService.list).mockResolvedValue([mockProperty])

        renderPage()

        const row = await screen.findByTestId("alert-row-alert-1")
        await waitFor(() => {
            expect(
                within(row).getByText("Casa Principal"),
            ).toBeInTheDocument()
        })
    })

    it("fallback para ID curto quando Property não está no lookup", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ propertyId: "7c4a1b2e-1234-5678-90ab-cdef12345678" }),
        ])
        vi.mocked(propertyService.list).mockResolvedValue([]) // lookup vazio

        renderPage()

        const row = await screen.findByTestId("alert-row-alert-1")
        expect(
            within(row).getByText(/Propriedade · 7c4a1b2e/),
        ).toBeInTheDocument()
    })

    it("para AREA target, sempre cai no fallback (lookup não tem areas no PR1)", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                targetType: "AREA",
                propertyId: null,
                areaId: "9e1d3a45-abc-def",
            }),
        ])
        vi.mocked(propertyService.list).mockResolvedValue([mockProperty])

        renderPage()

        const row = await screen.findByTestId("alert-row-alert-1")
        expect(within(row).getByText(/Área · 9e1d3a45/)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// URL sync
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — URL sync", () => {
    beforeEach(() => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([makeAlert()])
    })

    it("inicia com filtro 'Todos' quando URL não tem ?triggered", async () => {
        renderPage("/alertas")

        await screen.findByTestId("alert-triggered-filter")

        expect(
            screen.getByRole("button", { name: "Todos" }),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("inicia com filtro 'Disparados' quando URL tem ?triggered=true", async () => {
        renderPage("/alertas?triggered=true")

        await screen.findByTestId("alert-triggered-filter")

        expect(
            screen.getByRole("button", { name: "Disparados" }),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("inicia com filtro 'Ativos' quando URL tem ?triggered=false", async () => {
        renderPage("/alertas?triggered=false")

        await screen.findByTestId("alert-triggered-filter")

        expect(
            screen.getByRole("button", { name: "Ativos" }),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("trata valor inválido (?triggered=asdf) como 'Todos' (fallback tolerante)", async () => {
        renderPage("/alertas?triggered=asdf")

        await screen.findByTestId("alert-triggered-filter")

        expect(
            screen.getByRole("button", { name: "Todos" }),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("clicar em 'Disparados' atualiza a URL para ?triggered=true", async () => {
        const user = userEvent.setup()
        renderPage("/alertas")

        await screen.findByTestId("alert-triggered-filter")

        await user.click(screen.getByRole("button", { name: "Disparados" }))

        await waitFor(() => {
            expect(
                screen.getByTestId("location-spy"),
            ).toHaveAttribute("data-search", "?triggered=true")
        })
    })

    it("clicar em 'Ativos' atualiza a URL para ?triggered=false", async () => {
        const user = userEvent.setup()
        renderPage("/alertas")

        await screen.findByTestId("alert-triggered-filter")

        await user.click(screen.getByRole("button", { name: "Ativos" }))

        await waitFor(() => {
            expect(
                screen.getByTestId("location-spy"),
            ).toHaveAttribute("data-search", "?triggered=false")
        })
    })

    it("clicar em 'Todos' remove o param da URL", async () => {
        const user = userEvent.setup()
        renderPage("/alertas?triggered=true")

        await screen.findByTestId("alert-triggered-filter")

        await user.click(screen.getByRole("button", { name: "Todos" }))

        await waitFor(() => {
            expect(
                screen.getByTestId("location-spy"),
            ).toHaveAttribute("data-search", "")
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// totalLabel
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — totalLabel", () => {
    it("singular ('1 alerta') quando há 1 alerta sem filtro", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([makeAlert()])

        renderPage()

        expect(
            await screen.findByTestId("alert-triggered-total"),
        ).toHaveTextContent("1 alerta")
    })

    it("plural ('3 alertas') quando há 3 alertas sem filtro", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "1" }),
            makeAlert({ id: "2" }),
            makeAlert({ id: "3" }),
        ])

        renderPage()

        expect(
            await screen.findByTestId("alert-triggered-total"),
        ).toHaveTextContent("3 alertas")
    })

    it("'X de Y alertas' quando há filtro ativo", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({
                id: "1",
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
            makeAlert({ id: "2" }),
            makeAlert({ id: "3" }),
        ])

        renderPage("/alertas?triggered=true")

        expect(
            await screen.findByTestId("alert-triggered-total"),
        ).toHaveTextContent("1 de 3 alertas")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Botão "Marcar todos como lidos"
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — botão 'Marcar todos como lidos'", () => {
    it("NÃO aparece quando não há alertas disparados não-lidos", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: null }), // ativo
            makeAlert({
                id: "alert-2",
                triggeredAt: "2025-11-10T12:00:00.000Z",
                readAt: "2025-11-11T08:30:00.000Z", // já lido
            }),
        ])

        renderPage()

        await screen.findByTestId("alert-table")

        expect(
            screen.queryByTestId("alerts-page-mark-all-button"),
        ).toBeNull()
    })

    it("APARECE com contagem quando há disparados não-lidos", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: "2025-11-10T12:00:00.000Z" }),
            makeAlert({ id: "alert-2", triggeredAt: "2025-11-10T13:00:00.000Z" }),
            makeAlert({ id: "alert-3", triggeredAt: "2025-11-10T14:00:00.000Z" }),
        ])

        renderPage()

        const button = await screen.findByTestId("alerts-page-mark-all-button")
        expect(button).toHaveTextContent(/marcar 3 como lidos/i)
    })

    it("singular ('Marcar 1 como lido') quando há exatamente 1 não-lido", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: "2025-11-10T12:00:00.000Z" }),
        ])

        renderPage()

        const button = await screen.findByTestId("alerts-page-mark-all-button")
        expect(button).toHaveTextContent(/marcar 1 como lido$/i)
    })

    it("clicar dispara markAsRead em paralelo para cada não-lido", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: "2025-11-10T12:00:00.000Z" }),
            makeAlert({ id: "alert-2", triggeredAt: "2025-11-10T13:00:00.000Z" }),
        ])
        vi.mocked(alertService.markAsRead).mockResolvedValue(
            makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z", readAt: new Date().toISOString() }),
        )

        renderPage()

        await user.click(
            await screen.findByTestId("alerts-page-mark-all-button"),
        )

        await waitFor(() => {
            expect(alertService.markAsRead).toHaveBeenCalledWith("alert-1")
            expect(alertService.markAsRead).toHaveBeenCalledWith("alert-2")
        })
    })

    it("toast de sucesso com contagem quando tudo deu certo", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", triggeredAt: "2025-11-10T12:00:00.000Z" }),
            makeAlert({ id: "alert-2", triggeredAt: "2025-11-10T13:00:00.000Z" }),
        ])
        vi.mocked(alertService.markAsRead).mockResolvedValue(
            makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z", readAt: new Date().toISOString() }),
        )

        renderPage()

        await user.click(
            await screen.findByTestId("alerts-page-mark-all-button"),
        )

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(
                "2 alertas marcados como lidos",
            )
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edição inline
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — edição inline", () => {
    it("clicar em 'Editar' no menu abre AlertFormDialog em modo edit", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.listGlobal).mockResolvedValue([
            makeAlert({ id: "alert-1", thresholdKwh: 100 }),
        ])

        renderPage()

        await user.click(
            await screen.findByTestId("alert-menu-trigger-alert-1"),
        )
        await user.click(screen.getByTestId("alert-menu-edit-alert-1"))

        expect(screen.getByTestId("alert-form-dialog")).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { name: /editar alerta/i }),
        ).toBeInTheDocument()
    })
})