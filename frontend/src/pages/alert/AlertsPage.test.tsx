import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor, within } from "@testing-library/react"
import { AlertsPage } from "@/pages/alert/AlertsPage"
import { alertService } from "@/services/alert.service"
import { alertEventService } from "@/services/alert-event.service"
import { meterService } from "@/services/meter.service"
import type { AlertWithStatus } from "@/types/alert.types"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        list: vi.fn(),
        firing: vi.fn(),
        stats: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        patchEnabled: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/alert-event.service", () => ({
    alertEventService: { list: vi.fn() },
}))

vi.mock("@/services/meter.service", () => ({
    meterService: { list: vi.fn() },
}))

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
})

const mockMeter: Meter = {
    id: "meter-1",
    name: "Medidor da geladeira",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    protocol: "MQTT",
    host: "broker.local",
    port: 1883,
    topic: "lumitrack/meter-1",
    address: null,
    extra: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockAlert: AlertWithStatus = {
    id: "alert-1",
    userId: "user-1",
    meterId: "meter-1",
    name: "Geladeira fora da faixa",
    referencePowerKw: 10,
    tolerancePercent: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "normal",
    target: { type: "PROPERTY", name: "Casa Principal", path: "/propriedades/prop-1" },
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AlertsPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(alertService.firing).mockResolvedValue([])
    vi.mocked(alertService.stats).mockResolvedValue({ enabledCount: 0 })
    vi.mocked(alertEventService.list).mockResolvedValue(paginated([]))
    vi.mocked(meterService.list).mockResolvedValue(paginated([mockMeter]))
})

// ─────────────────────────────────────────────────────────────────────────────
// Listar
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — listar", () => {
    it("mostra o skeleton enquanto carrega", () => {
        vi.mocked(alertService.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        expect(screen.getByTestId("alerts-page-skeleton")).toBeInTheDocument()
    })

    it("mostra um alerta inline quando o fetch falha", async () => {
        vi.mocked(alertService.list).mockRejectedValue(new Error("Falha ao listar alertas"))

        renderPage()

        expect(await screen.findByText("Falha ao listar alertas")).toBeInTheDocument()
    })

    it("mostra o empty state sem nenhum alerta configurado", async () => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(await screen.findByText("Nenhum alerta configurado")).toBeInTheDocument()
    })

    it("sem nenhum alerta, o histórico mostra o texto de vazio e não renderiza o seletor", async () => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(
                "Crie um alerta para começar a acumular histórico de disparos.",
            ),
        ).toBeInTheDocument()
        expect(screen.queryByTestId("alert-events-select")).not.toBeInTheDocument()
    })

    it("lista os alertas e mostra os KPIs", async () => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([mockAlert]))
        vi.mocked(alertService.stats).mockResolvedValue({ enabledCount: 3 })
        vi.mocked(alertService.firing).mockResolvedValue([mockAlert])

        renderPage()

        const row = await screen.findByTestId(`alert-row-${mockAlert.id}`)
        expect(within(row).getByText("Geladeira fora da faixa")).toBeInTheDocument()

        await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument())
        // "Em disparo agora" — 1 alerta na lista mockada de `firing`.
        await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Criar
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — criar alerta", () => {
    beforeEach(() => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([]))
    })

    it("abre o dialog de criação ao clicar em 'Criar alerta'", async () => {
        const user = userEvent.setup()
        renderPage()
        await screen.findByText("Nenhum alerta configurado")

        await user.click(screen.getByTestId("alerts-page-create-button"))

        expect(await screen.findByRole("heading", { name: "Criar alerta" })).toBeInTheDocument()
    })

    it("preenche o form e chama alertService.create ao submeter", async () => {
        vi.mocked(alertService.create).mockResolvedValue({ ...mockAlert, id: "alert-new" })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText("Nenhum alerta configurado")

        await user.click(screen.getByTestId("alerts-page-create-button"))
        await screen.findByRole("heading", { name: "Criar alerta" })

        await user.type(screen.getByTestId("alert-form-name"), "Ar-condicionado ligado demais")
        await user.selectOptions(screen.getByTestId("alert-form-meterId"), "meter-1")
        await user.clear(screen.getByTestId("alert-form-referencePowerKw"))
        await user.type(screen.getByTestId("alert-form-referencePowerKw"), "12")
        await user.clear(screen.getByTestId("alert-form-tolerancePercent"))
        await user.type(screen.getByTestId("alert-form-tolerancePercent"), "5")
        await user.click(screen.getByTestId("alert-form-submit"))

        await waitFor(() =>
            expect(alertService.create).toHaveBeenCalledWith({
                name: "Ar-condicionado ligado demais",
                meterId: "meter-1",
                referencePowerKw: 12,
                tolerancePercent: 5,
                enabled: true,
            }),
        )
        // Dialog fecha após sucesso — o form some da tela.
        await waitFor(() =>
            expect(screen.queryByRole("heading", { name: "Criar alerta" })).not.toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Editar
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — editar alerta", () => {
    beforeEach(() => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([mockAlert]))
    })

    it("abre o dialog de edição pré-preenchido a partir do menu ⋯ da linha", async () => {
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${mockAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${mockAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-edit-${mockAlert.id}`))

        expect(await screen.findByRole("heading", { name: "Editar alerta" })).toBeInTheDocument()
        expect(screen.getByTestId("alert-form-name")).toHaveValue(mockAlert.name)
    })

    it("chama alertService.update com o id e os dados editados", async () => {
        vi.mocked(alertService.update).mockResolvedValue({ ...mockAlert, name: "Novo nome" })
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${mockAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${mockAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-edit-${mockAlert.id}`))
        await screen.findByRole("heading", { name: "Editar alerta" })

        await user.clear(screen.getByTestId("alert-form-name"))
        await user.type(screen.getByTestId("alert-form-name"), "Novo nome")
        await user.click(screen.getByTestId("alert-form-submit"))

        await waitFor(() =>
            expect(alertService.update).toHaveBeenCalledWith(mockAlert.id, {
                name: "Novo nome",
                referencePowerKw: mockAlert.referencePowerKw,
                tolerancePercent: mockAlert.tolerancePercent,
                enabled: mockAlert.enabled,
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Habilitar / desabilitar
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — habilitar/desabilitar", () => {
    it("desabilita um alerta habilitado a partir do menu ⋯ da linha", async () => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([mockAlert]))
        vi.mocked(alertService.patchEnabled).mockResolvedValue({ ...mockAlert, enabled: false })
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${mockAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${mockAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-toggle-enabled-${mockAlert.id}`))

        await waitFor(() =>
            expect(alertService.patchEnabled).toHaveBeenCalledWith(mockAlert.id, false),
        )
    })

    it("habilita um alerta desabilitado a partir do menu ⋯ da linha", async () => {
        const disabledAlert: AlertWithStatus = { ...mockAlert, enabled: false }
        vi.mocked(alertService.list).mockResolvedValue(paginated([disabledAlert]))
        vi.mocked(alertService.patchEnabled).mockResolvedValue({ ...disabledAlert, enabled: true })
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${disabledAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${disabledAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-toggle-enabled-${disabledAlert.id}`))

        await waitFor(() =>
            expect(alertService.patchEnabled).toHaveBeenCalledWith(disabledAlert.id, true),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Excluir
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertsPage — excluir", () => {
    beforeEach(() => {
        vi.mocked(alertService.list).mockResolvedValue(paginated([mockAlert]))
    })

    it("pede confirmação antes de excluir", async () => {
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${mockAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${mockAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-delete-${mockAlert.id}`))

        expect(await screen.findByText("Excluir alerta?")).toBeInTheDocument()
        expect(alertService.delete).not.toHaveBeenCalled()
    })

    it("chama alertService.delete ao confirmar a exclusão", async () => {
        vi.mocked(alertService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderPage()
        await screen.findByTestId(`alert-row-${mockAlert.id}`)

        await user.click(screen.getByTestId(`alert-menu-trigger-${mockAlert.id}`))
        await user.click(await screen.findByTestId(`alert-menu-delete-${mockAlert.id}`))
        await screen.findByText("Excluir alerta?")
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() => expect(alertService.delete).toHaveBeenCalledWith(mockAlert.id))
    })
})
