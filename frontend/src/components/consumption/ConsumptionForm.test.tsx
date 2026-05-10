import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConsumptionForm } from "@/components/consumption/ConsumptionForm"
import type { ConsumptionRecord } from "@/types/consumption.types"

// Mock do módulo — todayForPeriod retorna valor fixo sem precisar de fake timers
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

interface RenderOptions {
    initialData?: ConsumptionRecord
    onSubmit?: (data: unknown) => Promise<void>
    onCancel?: () => void
    submitLabel?: string
}

const renderForm = ({
    initialData,
    onSubmit = vi.fn().mockResolvedValue(undefined),
    onCancel = vi.fn(),
    submitLabel,
}: RenderOptions = {}) =>
    render(
        <ConsumptionForm
            initialData={initialData}
            onSubmit={onSubmit}
            onCancel={onCancel}
            submitLabel={submitLabel}
        />,
    )

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo criação — defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — modo criação (defaults)", () => {
    it("renderiza os 4 campos (period, data, kwh, notes)", () => {
        renderForm()

        expect(screen.getByLabelText(/período/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/^data$/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/consumo \(kwh\)/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/observações/i)).toBeInTheDocument()
    })

    it("começa com period=DAILY", () => {
        renderForm()

        expect(screen.getByLabelText(/período/i)).toHaveValue("DAILY")
    })

    it("começa com referenceDate = hoje (via mock todayForPeriod)", () => {
        renderForm()

        // Mocked pra "2026-05-06"
        expect(screen.getByLabelText(/^data$/i)).toHaveValue("2026-05-06")
    })

    it("começa com kwhConsumed vazio", () => {
        renderForm()

        expect(screen.getByLabelText(/consumo/i)).toHaveValue(null)
    })

    it("começa com notes vazio", () => {
        renderForm()

        expect(screen.getByLabelText(/observações/i)).toHaveValue("")
    })

    it("não exibe banner de aviso de edição", () => {
        renderForm()

        expect(
            screen.queryByTestId("consumption-form-edit-warning"),
        ).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Input de data adapta-se ao period (modo criação)
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — input de data por period", () => {
    it("DAILY (default): input type='date', label 'Data'", () => {
        renderForm()

        expect(screen.getByLabelText(/^data$/i)).toHaveAttribute("type", "date")
    })

    it("HOURLY: input type='datetime-local', label 'Data e hora'", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/período/i), "HOURLY")

        expect(screen.getByLabelText(/data e hora/i)).toHaveAttribute(
            "type",
            "datetime-local",
        )
    })

    it("MONTHLY: input type='month', label 'Mês'", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/período/i), "MONTHLY")

        expect(screen.getByLabelText(/^mês$/i)).toHaveAttribute("type", "month")
    })

    it("ANNUAL: input type='number' com min=2000 max=2100", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/período/i), "ANNUAL")

        const input = screen.getByLabelText(/^ano$/i)
        expect(input).toHaveAttribute("type", "number")
        expect(input).toHaveAttribute("min", "2000")
        expect(input).toHaveAttribute("max", "2100")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reset de referenceDate ao trocar period (NÃO no mount)
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — reset de referenceDate ao trocar period", () => {
    it("NÃO limpa referenceDate no mount (bug do useEffect corrigido)", () => {
        renderForm()

        // Deve ter o valor default, NÃO deve estar vazio
        expect(screen.getByLabelText(/^data$/i)).toHaveValue("2026-05-06")
    })

    it("limpa referenceDate ao trocar period (decisão UX A)", async () => {
        const user = userEvent.setup()
        renderForm()

        // Confirma valor inicial
        expect(screen.getByLabelText(/^data$/i)).toHaveValue("2026-05-06")

        // Troca para MONTHLY → deve limpar
        await user.selectOptions(screen.getByLabelText(/período/i), "MONTHLY")

        await waitFor(() => {
            expect(screen.getByLabelText(/^mês$/i)).toHaveValue("")
        })
    })

    it("não limpa quando está em modo edição (period é readonly)", async () => {
        // Em modo edição não é possível trocar period (disabled),
        // mas testamos que o efeito não dispara no mount ao menos
        renderForm({ initialData: baseRecord })

        // referenceDate não foi limpo no mount
        expect(screen.getByLabelText(/^data/i)).toHaveValue("2025-01-15")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — validação", () => {
    it("rejeita kwhConsumed vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/informe um número válido/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita kwhConsumed zero", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/consumo/i), "0")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/maior que zero/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("aceita submit quando todos os campos obrigatórios estão preenchidos", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/consumo/i), "12.5")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as {
            period: string
            referenceDate: string
            kwhConsumed: number
            notes?: string
        }
        expect(data.period).toBe("DAILY")
        expect(data.referenceDate).toBe("2026-05-06")
        expect(data.kwhConsumed).toBe(12.5)
        expect(data.notes).toBeUndefined()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — modo edição", () => {
    it("preenche os campos com os dados do registro", () => {
        renderForm({ initialData: baseRecord })

        expect(screen.getByLabelText(/período/i)).toHaveValue("DAILY")
        expect(screen.getByLabelText(/^data/i)).toHaveValue("2025-01-15")
        expect(screen.getByLabelText(/consumo/i)).toHaveValue(12.5)
        expect(screen.getByLabelText(/observações/i)).toHaveValue("")
    })

    it("preenche notes quando existe no registro", () => {
        renderForm({
            initialData: { ...baseRecord, notes: "Pico de uso" },
        })

        expect(screen.getByLabelText(/observações/i)).toHaveValue("Pico de uso")
    })

    it("desabilita os campos period e referenceDate", () => {
        renderForm({ initialData: baseRecord })

        expect(screen.getByLabelText(/período/i)).toBeDisabled()
        expect(screen.getByLabelText(/^data/i)).toBeDisabled()
    })

    it("mantém kwhConsumed e notes habilitados", () => {
        renderForm({ initialData: baseRecord })

        expect(screen.getByLabelText(/consumo/i)).not.toBeDisabled()
        expect(screen.getByLabelText(/observações/i)).not.toBeDisabled()
    })

    it("renderiza banner de aviso", () => {
        renderForm({ initialData: baseRecord })

        const banner = screen.getByTestId("consumption-form-edit-warning")
        expect(banner).toBeInTheDocument()
        expect(banner).toHaveTextContent(
            /período e data não podem ser alterados/i,
        )
    })

    it("submete com os campos editáveis", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ initialData: baseRecord, onSubmit })

        const kwhInput = screen.getByLabelText(/consumo/i)
        await user.clear(kwhInput)
        await user.type(kwhInput, "20")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as {
            period: string
            referenceDate: string
            kwhConsumed: number
        }
        expect(data.period).toBe("DAILY")
        expect(data.referenceDate).toBe("2025-01-15")
        expect(data.kwhConsumed).toBe(20)
    })

    it("renderiza input de data tipo correto baseado no period (HOURLY)", () => {
        renderForm({
            initialData: {
                ...baseRecord,
                period: "HOURLY",
                referenceDate: "2025-01-15T17:00:00.000Z",
            },
        })

        const dateInput = screen.getByLabelText(/data e hora/i)
        expect(dateInput).toHaveAttribute("type", "datetime-local")
        expect(dateInput).toBeDisabled()
    })

    it("renderiza input de data tipo correto baseado no period (MONTHLY)", () => {
        renderForm({
            initialData: {
                ...baseRecord,
                period: "MONTHLY",
                referenceDate: "2025-01-01T12:00:00.000Z",
            },
        })

        const dateInput = screen.getByLabelText(/^mês/i)
        expect(dateInput).toHaveAttribute("type", "month")
        expect(dateInput).toHaveValue("2025-01")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Botões
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionForm — botões", () => {
    it("usa submitLabel customizado quando passado", () => {
        renderForm({ submitLabel: "Criar registro" })

        expect(
            screen.getByRole("button", { name: /criar registro/i }),
        ).toBeInTheDocument()
    })

    it("dispara onCancel ao clicar em Cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalled()
    })
})