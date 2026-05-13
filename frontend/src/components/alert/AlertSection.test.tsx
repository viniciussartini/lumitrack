import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    PropertyAlertSection,
    AreaAlertSection,
    DeviceAlertSection,
} from "@/components/alert/AlertSection"
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

const renderWithClient = (ui: ReactNode) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// PR1: wrappers chamam o service correto
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyAlertSection", () => {
    it("usa listByProperty com o propertyId recebido", async () => {
        vi.mocked(alertService.listByProperty).mockResolvedValue([])

        renderWithClient(<PropertyAlertSection propertyId="prop-1" />)

        await waitFor(() =>
            expect(alertService.listByProperty).toHaveBeenCalledWith("prop-1"),
        )
    })

    it("EmptyState menciona 'desta propriedade' (gramática correta)", async () => {
        vi.mocked(alertService.listByProperty).mockResolvedValue([])

        renderWithClient(<PropertyAlertSection propertyId="prop-1" />)

        expect(
            await screen.findByText(
                /crie um alerta de consumo para desta propriedade/i,
            ),
        ).toBeInTheDocument()
    })
})

describe("AreaAlertSection", () => {
    it("usa listByArea com propertyId + areaId", async () => {
        vi.mocked(alertService.listByArea).mockResolvedValue([])

        renderWithClient(
            <AreaAlertSection propertyId="prop-1" areaId="area-1" />,
        )

        await waitFor(() =>
            expect(alertService.listByArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
            ),
        )
    })

    it("EmptyState menciona 'desta área' (gramática correta)", async () => {
        vi.mocked(alertService.listByArea).mockResolvedValue([])

        renderWithClient(
            <AreaAlertSection propertyId="prop-1" areaId="area-1" />,
        )

        expect(
            await screen.findByText(
                /crie um alerta de consumo para desta área/i,
            ),
        ).toBeInTheDocument()
    })
})

describe("DeviceAlertSection", () => {
    it("usa listByDevice com a tripla completa de IDs", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await waitFor(() =>
            expect(alertService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
            ),
        )
    })

    it("EmptyState menciona 'deste dispositivo' (gramática correta)", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByText(
                /crie um alerta de consumo para deste dispositivo/i,
            ),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Estados visuais
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertSection — header", () => {
    beforeEach(() => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])
    })

    it("renderiza heading 'Alertas'", () => {
        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            screen.getByRole("heading", { level: 2, name: "Alertas" }),
        ).toBeInTheDocument()
    })

    it("renderiza botão 'Criar alerta' no header", () => {
        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            screen.getByRole("button", { name: /criar alerta/i }),
        ).toBeInTheDocument()
    })
})

describe("AlertSection — loading", () => {
    it("renderiza skeleton enquanto a query carrega", async () => {
        vi.mocked(alertService.listByDevice).mockImplementation(
            () => new Promise(() => {}),
        )

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("alert-section-skeleton"),
        ).toBeInTheDocument()
    })
})

describe("AlertSection — erro", () => {
    it("renderiza alerta com a mensagem do erro", async () => {
        vi.mocked(alertService.listByDevice).mockRejectedValue(
            new Error("Falha de rede"),
        )

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/falha de rede/i)
    })

    it("renderiza mensagem default quando o erro não é Error", async () => {
        vi.mocked(alertService.listByDevice).mockRejectedValue(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "string crua" as any,
        )

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/não foi possível carregar/i)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Com dados — tabela, totalLabel, ordenação
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertSection — com dados", () => {
    it("renderiza a tabela quando há alertas", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([makeAlert()])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(await screen.findByTestId("alert-table")).toBeInTheDocument()
        expect(screen.getByTestId("alert-row-alert-1")).toBeInTheDocument()
    })

    it("renderiza totalLabel singular ('1 alerta')", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([makeAlert()])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("alert-section-total"),
        ).toHaveTextContent("1 alerta")
    })

    it("renderiza totalLabel plural ('3 alertas')", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([
            makeAlert({ id: "alert-1" }),
            makeAlert({ id: "alert-2" }),
            makeAlert({ id: "alert-3" }),
        ])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("alert-section-total"),
        ).toHaveTextContent("3 alertas")
    })

    it("trunca em 20 e mostra '20 de N alertas' quando há mais", async () => {
        // Cria 25 alertas
        const alerts = Array.from({ length: 25 }, (_, i) =>
            makeAlert({ id: `alert-${i + 1}` }),
        )
        vi.mocked(alertService.listByDevice).mockResolvedValue(alerts)

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("alert-section-total"),
        ).toHaveTextContent("20 de 25 alertas")

        // getAllByRole("row") retorna header + linhas; slice(1) descarta o header
        const rows = screen.getAllByRole("row").slice(1)
        expect(rows).toHaveLength(20)
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

        // Backend retorna em ordem aleatória — a section deve reordenar
        vi.mocked(alertService.listByDevice).mockResolvedValue([
            read,
            active,
            triggered,
        ])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByTestId("alert-table")

        // getAllByRole("row").slice(1) descarta a linha do header
        const rows = screen.getAllByRole("row").slice(1)
        expect(rows[0]).toHaveAttribute("data-testid", "alert-row-triggered")
        expect(rows[1]).toHaveAttribute("data-testid", "alert-row-active")
        expect(rows[2]).toHaveAttribute("data-testid", "alert-row-read")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertSection — vazio", () => {
    it("renderiza EmptyState com título 'Nenhum alerta configurado'", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByText(/nenhum alerta configurado/i),
        ).toBeInTheDocument()
    })

    it("NÃO renderiza totalLabel quando não há alertas (UX limpa)", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceAlertSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByText(/nenhum alerta configurado/i)

        expect(screen.queryByTestId("alert-section-total")).toBeNull()
    })
})