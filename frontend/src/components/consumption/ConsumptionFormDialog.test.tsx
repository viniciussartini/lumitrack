import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import type { ReactNode } from "react"
import { ConsumptionFormDialog } from "@/components/consumption/ConsumptionFormDialog"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionRecord } from "@/types/consumption.types"

vi.mock("@/lib/consumption-date", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/lib/consumption-date")>()
    return {
        ...actual,
        todayForPeriod: vi.fn((period: string) => {
            switch (period) {
                case "HOURLY":
                    return "2026-05-06T14:30"
                case "DAILY":
                    return "2026-05-06"
                case "MONTHLY":
                    return "2026-05"
                case "ANNUAL":
                    return "2026"
                default:
                    return "2026-05-06"
            }
        }),
    }
})

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
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro desconhecido",
}))

const baseRecord: ConsumptionRecord = {
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

const renderDialog = (ui: ReactNode) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const { unmount } = render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    )
    return { unmount }
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Render condicional
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — render condicional", () => {
    it("não renderiza conteúdo quando isOpen=false", () => {
        renderDialog(
            <ConsumptionFormDialog
                isOpen={false}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(
            screen.queryByTestId("consumption-form-dialog"),
        ).not.toBeInTheDocument()
    })

    it("renderiza conteúdo quando isOpen=true", () => {
        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(
            screen.getByTestId("consumption-form-dialog"),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo create — UI
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — modo create (UI)", () => {
    it("renderiza título 'Registrar consumo' e botão 'Criar registro'", () => {
        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(
            screen.getByRole("heading", { name: /registrar consumo/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /criar registro/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo create — mutation por target
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — modo create (mutation por target)", () => {
    it("target=property: chama createForProperty com ISO convertido", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "12.5")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({
                    period: "DAILY",
                    // "2026-05-06" (mock) → ISO
                    referenceDate: "2026-05-06T12:00:00.000Z",
                    kwhConsumed: 12.5,
                }),
            )
        })
    })

    it("target=area: chama createForArea", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForArea).mockResolvedValue({
            ...baseRecord,
            propertyId: null,
            areaId: "area-1",
        })

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "area", propertyId: "prop-1", areaId: "area-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "5")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                expect.objectContaining({ kwhConsumed: 5 }),
            )
        })
    })

    it("target=device: chama createForDevice", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForDevice).mockResolvedValue({
            ...baseRecord,
            propertyId: null,
            deviceId: "dev-1",
        })

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{
                    type: "device",
                    propertyId: "prop-1",
                    areaId: "area-1",
                    deviceId: "dev-1",
                }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "0.8")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                expect.objectContaining({ kwhConsumed: 0.8 }),
            )
        })
    })

    it("inclui notes quando preenchida", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "12")
        await user.type(screen.getByLabelText(/observações/i), "Pico do verão")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({ notes: "Pico do verão" }),
            )
        })
    })

    it("OMITE notes do payload quando vazia", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "12")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForProperty).toHaveBeenCalled()
        })

        const payload = vi.mocked(consumptionService.createForProperty).mock
            .calls[0]![1]
        expect(payload).not.toHaveProperty("notes")
    })

    it("fecha o dialog após sucesso (chama onClose)", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "12")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo create — conversão de data por period
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — conversão de data por period", () => {
    it("MONTHLY: 'YYYY-MM' do input vira 'YYYY-MM-01T12:00:00.000Z'", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.selectOptions(screen.getByLabelText(/período/i), "MONTHLY")
        // Após trocar, referenceDate foi resetado. Preenche o novo input.
        await user.type(screen.getByLabelText(/^mês/i), "2025-03")
        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "350")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({
                    period: "MONTHLY",
                    referenceDate: "2025-03-01T12:00:00.000Z",
                }),
            )
        })
    })

    it("ANNUAL: 'YYYY' do input vira 'YYYY-01-01T12:00:00.000Z'", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            baseRecord,
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.selectOptions(screen.getByLabelText(/período/i), "ANNUAL")
        await user.type(screen.getByLabelText(/^ano/i), "2024")
        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "4500")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(consumptionService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({
                    period: "ANNUAL",
                    referenceDate: "2024-01-01T12:00:00.000Z",
                }),
            )
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edit
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — modo edit", () => {
    it("renderiza título 'Editar registro' e botão 'Salvar alterações'", () => {
        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", record: baseRecord }}
            />,
        )

        expect(
            screen.getByRole("heading", { name: /editar registro/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /salvar alterações/i }),
        ).toBeInTheDocument()
    })

    it("chama service.update apenas com kwhConsumed e notes", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.update).mockResolvedValue({
            ...baseRecord,
            kwhConsumed: 20,
        })

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", record: baseRecord }}
            />,
        )

        const kwhInput = screen.getByLabelText(/consumo \(kwh\)/i)
        await user.clear(kwhInput)
        await user.type(kwhInput, "20")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(consumptionService.update).toHaveBeenCalledWith(
                "prop-1",
                "rec-1",
                { kwhConsumed: 20 },
            )
        })

        const payload = vi.mocked(consumptionService.update).mock.calls[0]![2]
        expect(payload).not.toHaveProperty("period")
        expect(payload).not.toHaveProperty("referenceDate")
    })

    it("inclui notes editadas", async () => {
        const user = userEvent.setup()
        vi.mocked(consumptionService.update).mockResolvedValue(baseRecord)

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", record: baseRecord }}
            />,
        )

        await user.type(screen.getByLabelText(/observações/i), "Atualizado")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(consumptionService.update).toHaveBeenCalledWith(
                "prop-1",
                "rec-1",
                expect.objectContaining({ notes: "Atualizado" }),
            )
        })
    })

    it("modo edit em registro de DEVICE usa propertyId pra rota", async () => {
        const user = userEvent.setup()
        const deviceRecord: ConsumptionRecord = {
            ...baseRecord,
            id: "rec-d1",
            propertyId: null,
            deviceId: "dev-1",
        }
        vi.mocked(consumptionService.update).mockResolvedValue(deviceRecord)

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{
                    type: "device",
                    propertyId: "prop-1",
                    areaId: "area-1",
                    deviceId: "dev-1",
                }}
                mode={{ kind: "edit", record: deviceRecord }}
            />,
        )

        const kwhInput = screen.getByLabelText(/consumo \(kwh\)/i)
        await user.clear(kwhInput)
        await user.type(kwhInput, "1.2")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(consumptionService.update).toHaveBeenCalledWith(
                "prop-1",
                "rec-d1",
                { kwhConsumed: 1.2 },
            )
        })
    })

    it("fecha o dialog após sucesso", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(consumptionService.update).mockResolvedValue(baseRecord)

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", record: baseRecord }}
            />,
        )

        const kwhInput = screen.getByLabelText(/consumo \(kwh\)/i)
        await user.clear(kwhInput)
        await user.type(kwhInput, "20")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tratamento de erros
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — erros", () => {
    it("create: dispara toast.error com mensagem do backend e NÃO fecha", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(consumptionService.createForProperty).mockRejectedValue(
            new Error("Já existe um registro DAILY para esta data"),
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/consumo \(kwh\)/i), "12")
        await user.click(screen.getByRole("button", { name: /criar/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao criar registro",
                expect.objectContaining({
                    description: expect.stringMatching(/já existe/i),
                }),
            )
        })
        expect(onClose).not.toHaveBeenCalled()
    })

    it("edit: dispara toast.error e NÃO fecha", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(consumptionService.update).mockRejectedValue(
            new Error("403 Forbidden"),
        )

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", record: baseRecord }}
            />,
        )

        const kwhInput = screen.getByLabelText(/consumo \(kwh\)/i)
        await user.clear(kwhInput)
        await user.type(kwhInput, "20")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao atualizar registro",
                expect.objectContaining({
                    description: expect.stringMatching(/forbidden/i),
                }),
            )
        })
        expect(onClose).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancel / Close
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionFormDialog — cancel", () => {
    it("clicar em Cancelar dispara onClose", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()

        renderDialog(
            <ConsumptionFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onClose).toHaveBeenCalled()
    })
})