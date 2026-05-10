import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import {
    PropertyConsumptionSection,
    AreaConsumptionSection,
    DeviceConsumptionSection,
} from "@/components/consumption/ConsumptionSection"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionRecord } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

const mockRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "DAILY",
    referenceDate: "2025-01-15T12:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

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

describe("PropertyConsumptionSection", () => {
    it("usa listByProperty com o propertyId recebido", async () => {
        vi.mocked(consumptionService.listByProperty).mockResolvedValue([])

        renderWithClient(<PropertyConsumptionSection propertyId="prop-1" />)

        await waitFor(() =>
            expect(consumptionService.listByProperty).toHaveBeenCalledWith(
                "prop-1",
                undefined,
            ),
        )
    })

    it("PR3: EmptyState menciona 'desta propriedade' (gramática correta)", async () => {
        vi.mocked(consumptionService.listByProperty).mockResolvedValue([])

        renderWithClient(<PropertyConsumptionSection propertyId="prop-1" />)

        expect(
            await screen.findByText(/cadastre o consumo desta propriedade/i),
        ).toBeInTheDocument()
    })
})

describe("AreaConsumptionSection", () => {
    it("usa listByArea com propertyId + areaId", async () => {
        vi.mocked(consumptionService.listByArea).mockResolvedValue([])

        renderWithClient(
            <AreaConsumptionSection propertyId="prop-1" areaId="area-1" />,
        )

        await waitFor(() =>
            expect(consumptionService.listByArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                undefined,
            ),
        )
    })

    it("PR3: EmptyState menciona 'desta área' (gramática correta)", async () => {
        vi.mocked(consumptionService.listByArea).mockResolvedValue([])

        renderWithClient(
            <AreaConsumptionSection propertyId="prop-1" areaId="area-1" />,
        )

        expect(
            await screen.findByText(/cadastre o consumo desta área/i),
        ).toBeInTheDocument()
    })
})

describe("DeviceConsumptionSection", () => {
    it("usa listByDevice com a tripla completa de IDs", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await waitFor(() =>
            expect(consumptionService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                undefined,
            ),
        )
    })

    it("PR3: EmptyState menciona 'deste dispositivo' (gramática correta)", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        // ANTES: "desta dispositivo" — concordância nominal errada
        // AGORA: "deste dispositivo" — correto
        expect(
            await screen.findByText(/cadastre o consumo deste dispositivo/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR1: estados visuais
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionSection — header", () => {
    beforeEach(() => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])
    })

    it("renderiza heading 'Consumo'", () => {
        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            screen.getByRole("heading", { level: 2, name: "Consumo" }),
        ).toBeInTheDocument()
    })

    it("PR2: botão 'Registrar consumo' está HABILITADO", () => {
        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        const button = screen.getByRole("button", {
            name: /registrar consumo/i,
        })
        expect(button).toBeInTheDocument()
        expect(button).not.toBeDisabled()
    })
})

describe("ConsumptionSection — loading", () => {
    it("renderiza skeleton enquanto a query carrega", async () => {
        vi.mocked(consumptionService.listByDevice).mockImplementation(
            () => new Promise(() => {}),
        )

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("consumption-section-skeleton"),
        ).toBeInTheDocument()
    })
})

describe("ConsumptionSection — erro", () => {
    it("renderiza alerta com a mensagem do erro", async () => {
        vi.mocked(consumptionService.listByDevice).mockRejectedValue(
            new Error("Falha de rede"),
        )

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/falha de rede/i)
    })

    it("renderiza mensagem default quando o erro não é Error", async () => {
        vi.mocked(consumptionService.listByDevice).mockRejectedValue(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "string crua" as any,
        )

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/não foi possível carregar/i)
    })
})

describe("ConsumptionSection — vazio com filtro ativo", () => {
    it("PR3: mensagem com filtro DEVICE menciona 'deste dispositivo'", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByText(/cadastre o consumo deste dispositivo/i)

        await user.click(screen.getByRole("button", { name: "Hora" }))

        expect(
            await screen.findByText(
                /não há registros deste dispositivo para o período selecionado/i,
            ),
        ).toBeInTheDocument()
    })

    it("PR3: mensagem com filtro AREA menciona 'desta área'", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.listByArea).mockResolvedValue([])

        renderWithClient(
            <AreaConsumptionSection propertyId="prop-1" areaId="area-1" />,
        )

        await screen.findByText(/cadastre o consumo desta área/i)

        await user.click(screen.getByRole("button", { name: "Hora" }))

        expect(
            await screen.findByText(
                /não há registros desta área para o período selecionado/i,
            ),
        ).toBeInTheDocument()
    })
})

describe("ConsumptionSection — com dados", () => {
    it("renderiza a tabela quando há registros", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            mockRecord,
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("consumption-table"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("consumption-row-rec-1"),
        ).toBeInTheDocument()
    })

    it("renderiza totalLabel singular ('1 registro')", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            mockRecord,
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("consumption-period-total"),
        ).toHaveTextContent("1 registro")
    })

    it("renderiza totalLabel plural ('N registros')", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            { ...mockRecord, id: "rec-1" },
            { ...mockRecord, id: "rec-2" },
            { ...mockRecord, id: "rec-3" },
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            await screen.findByTestId("consumption-period-total"),
        ).toHaveTextContent("3 registros")
    })

    it("PR2: tabela renderiza coluna de ações", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            mockRecord,
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByTestId("consumption-table")

        expect(
            screen.getByRole("columnheader", { name: /ações/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR1: filtro de period
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionSection — filtro de period", () => {
    it("ao clicar num chip, refaz a query com o period selecionado", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await waitFor(() =>
            expect(consumptionService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                undefined,
            ),
        )

        await user.click(screen.getByRole("button", { name: "Mês" }))

        await waitFor(() =>
            expect(consumptionService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                "MONTHLY",
            ),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR2: dialog de create
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionSection — dialog de create", () => {
    beforeEach(() => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])
    })

    it("dialog NÃO está renderizado por padrão", () => {
        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        expect(
            screen.queryByTestId("consumption-form-dialog"),
        ).not.toBeInTheDocument()
    })

    it("clicar em 'Registrar consumo' abre dialog em modo CREATE", async () => {
        const user = userEvent.setup()

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await user.click(screen.getByTestId("consumption-section-create"))

        const dialog = await screen.findByTestId("consumption-form-dialog")
        expect(dialog).toBeInTheDocument()
        expect(
            within(dialog).getByRole("heading", {
                name: /registrar consumo/i,
            }),
        ).toBeInTheDocument()
        expect(
            within(dialog).getByRole("button", { name: /criar registro/i }),
        ).toBeInTheDocument()
    })

    it("Cancelar fecha o dialog", async () => {
        const user = userEvent.setup()

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await user.click(screen.getByTestId("consumption-section-create"))
        await screen.findByTestId("consumption-form-dialog")

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        await waitFor(() => {
            expect(
                screen.queryByTestId("consumption-form-dialog"),
            ).not.toBeInTheDocument()
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR2: dialog de edit (integração com row menu)
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionSection — dialog de edit", () => {
    it("clicar em 'Editar' no menu da linha abre dialog em modo EDIT", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            mockRecord,
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByTestId("consumption-row-rec-1")

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-edit"),
        )

        const dialog = await screen.findByTestId("consumption-form-dialog")
        expect(
            within(dialog).getByRole("heading", { name: /editar registro/i }),
        ).toBeInTheDocument()
        expect(
            within(dialog).getByRole("button", {
                name: /salvar alterações/i,
            }),
        ).toBeInTheDocument()
    })

    it("dialog em modo edit traz os dados do registro pré-preenchidos", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([
            { ...mockRecord, kwhConsumed: 42, notes: "Pico inverno" },
        ])

        renderWithClient(
            <DeviceConsumptionSection
                propertyId="prop-1"
                areaId="area-1"
                deviceId="dev-1"
            />,
        )

        await screen.findByTestId("consumption-row-rec-1")

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-edit"),
        )

        const dialog = await screen.findByTestId("consumption-form-dialog")

        expect(within(dialog).getByLabelText(/consumo/i)).toHaveValue(42)
        expect(within(dialog).getByLabelText(/observações/i)).toHaveValue(
            "Pico inverno",
        )
    })
})