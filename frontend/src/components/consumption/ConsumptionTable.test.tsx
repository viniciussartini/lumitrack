import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { ConsumptionTable } from "@/components/consumption/ConsumptionTable"
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

/** Render com QueryClient — necessário quando a tabela tem coluna de ações
 *  (RowMenu usa useDeleteConsumption). */
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
// Tests do PR1 (mantidos) — sem coluna de ações, render simples
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionTable — estrutura (sem ações)", () => {
    it("renderiza header com colunas Período, Data, kWh e Custo", () => {
        render(<ConsumptionTable records={[]} />)

        expect(
            screen.getByRole("columnheader", { name: /período/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("columnheader", { name: /data/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("columnheader", { name: /kwh/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("columnheader", { name: /custo/i }),
        ).toBeInTheDocument()
    })

    it("não renderiza coluna 'Ações' quando onEdit/propertyId ausentes", () => {
        render(<ConsumptionTable records={[]} />)

        expect(
            screen.queryByRole("columnheader", { name: /ações/i }),
        ).toBeNull()
    })

    it("renderiza tabela vazia (só o header) quando records=[]", () => {
        render(<ConsumptionTable records={[]} />)

        expect(screen.getByTestId("consumption-table")).toBeInTheDocument()
        expect(screen.queryByTestId(/^consumption-row-/)).toBeNull()
    })
})

describe("ConsumptionTable — linhas (sem ações)", () => {
    it("renderiza uma linha por registro com testid baseado no id", () => {
        const records: ConsumptionRecord[] = [
            { ...baseRecord, id: "rec-1" },
            { ...baseRecord, id: "rec-2" },
        ]

        render(<ConsumptionTable records={records} />)

        expect(screen.getByTestId("consumption-row-rec-1")).toBeInTheDocument()
        expect(screen.getByTestId("consumption-row-rec-2")).toBeInTheDocument()
    })

    it("renderiza label do period traduzida (DAILY → 'Dia')", () => {
        render(<ConsumptionTable records={[baseRecord]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("Dia")).toBeInTheDocument()
    })

    it("renderiza data formatada conforme o period (DAILY → DD/MM/AAAA)", () => {
        render(<ConsumptionTable records={[baseRecord]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("15/01/2025")).toBeInTheDocument()
    })

    it("renderiza kWh formatado em pt-BR com sufixo 'kWh'", () => {
        render(<ConsumptionTable records={[baseRecord]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("12,50")).toBeInTheDocument()
        expect(within(row).getByText("kWh")).toBeInTheDocument()
    })

    it("renderiza custo formatado em BRL (Intl arredonda 9.375 para 9,38)", () => {
        render(<ConsumptionTable records={[baseRecord]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText(/R\$\s9,38/)).toBeInTheDocument()
    })

    it("renderiza '—' quando costBrl é null", () => {
        const record: ConsumptionRecord = { ...baseRecord, costBrl: null }
        render(<ConsumptionTable records={[record]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("—")).toBeInTheDocument()
    })
})

describe("ConsumptionTable — notes (sem ações)", () => {
    it("renderiza ícone de notes com title quando notes existe", () => {
        const record: ConsumptionRecord = {
            ...baseRecord,
            notes: "Pico de uso",
        }
        render(<ConsumptionTable records={[record]} />)

        const icon = screen.getByTestId("consumption-row-rec-1-notes-icon")
        expect(icon).toBeInTheDocument()
        expect(icon).toHaveAttribute("title", "Pico de uso")
    })

    it("não renderiza ícone de notes quando notes é null", () => {
        render(<ConsumptionTable records={[{ ...baseRecord, notes: null }]} />)

        expect(
            screen.queryByTestId("consumption-row-rec-1-notes-icon"),
        ).toBeNull()
    })

    it("não renderiza ícone de notes quando notes é string vazia", () => {
        render(<ConsumptionTable records={[{ ...baseRecord, notes: "" }]} />)

        expect(
            screen.queryByTestId("consumption-row-rec-1-notes-icon"),
        ).toBeNull()
    })
})

describe("ConsumptionTable — formatação por period (sem ações)", () => {
    it("HOURLY: formata data com hora", () => {
        const record: ConsumptionRecord = {
            ...baseRecord,
            period: "HOURLY",
            referenceDate: "2025-01-15T14:00:00.000Z",
        }
        render(<ConsumptionTable records={[record]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(
            within(row).getByText(/15\/01\/2025[,\s]+\d{2}:\d{2}/),
        ).toBeInTheDocument()
    })

    it("HOURLY: renderiza label 'Hora'", () => {
        render(
            <ConsumptionTable
                records={[{ ...baseRecord, period: "HOURLY" }]}
            />,
        )

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("Hora")).toBeInTheDocument()
    })

    it("MONTHLY: formata como mês por extenso ('Janeiro de 2025')", () => {
        const record: ConsumptionRecord = {
            ...baseRecord,
            period: "MONTHLY",
            referenceDate: "2025-01-15T12:00:00.000Z",
        }
        render(<ConsumptionTable records={[record]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("Janeiro de 2025")).toBeInTheDocument()
    })

    it("MONTHLY: renderiza label 'Mês'", () => {
        render(
            <ConsumptionTable
                records={[{ ...baseRecord, period: "MONTHLY" }]}
            />,
        )

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("Mês")).toBeInTheDocument()
    })

    it("ANNUAL: formata apenas o ano", () => {
        const record: ConsumptionRecord = {
            ...baseRecord,
            period: "ANNUAL",
            referenceDate: "2025-06-30T12:00:00.000Z",
        }
        render(<ConsumptionTable records={[record]} />)

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("2025")).toBeInTheDocument()
    })

    it("ANNUAL: renderiza label 'Ano'", () => {
        render(
            <ConsumptionTable
                records={[{ ...baseRecord, period: "ANNUAL" }]}
            />,
        )

        const row = screen.getByTestId("consumption-row-rec-1")
        expect(within(row).getByText("Ano")).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests do PR2 — coluna de ações
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionTable — coluna de ações (com onEdit + propertyId)", () => {
    it("não renderiza coluna 'Ações' quando só onEdit é provido (sem propertyId)", () => {
        render(<ConsumptionTable records={[]} onEdit={vi.fn()} />)

        expect(
            screen.queryByRole("columnheader", { name: /ações/i }),
        ).toBeNull()
    })

    it("não renderiza coluna 'Ações' quando só propertyId é provido (sem onEdit)", () => {
        render(<ConsumptionTable records={[]} propertyId="prop-1" />)

        expect(
            screen.queryByRole("columnheader", { name: /ações/i }),
        ).toBeNull()
    })

    it("renderiza coluna 'Ações' quando AMBOS onEdit + propertyId são providos", () => {
        renderWithClient(
            <ConsumptionTable
                records={[]}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        expect(
            screen.getByRole("columnheader", { name: /ações/i }),
        ).toBeInTheDocument()
    })

    it("renderiza <ConsumptionRowMenu> em cada linha quando coluna de ações está ativa", () => {
        renderWithClient(
            <ConsumptionTable
                records={[
                    { ...baseRecord, id: "rec-1" },
                    { ...baseRecord, id: "rec-2" },
                ]}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        expect(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("consumption-row-rec-2-menu-trigger"),
        ).toBeInTheDocument()
    })

    it("clicar em 'Editar' chama onEdit com o record da linha", async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()

        renderWithClient(
            <ConsumptionTable
                records={[
                    { ...baseRecord, id: "rec-1" },
                    { ...baseRecord, id: "rec-2", kwhConsumed: 5 },
                ]}
                propertyId="prop-1"
                onEdit={onEdit}
            />,
        )

        // Abre o menu da linha 2 e clica em Editar
        await user.click(
            screen.getByTestId("consumption-row-rec-2-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-2-menu-edit"),
        )

        expect(onEdit).toHaveBeenCalledWith(
            expect.objectContaining({ id: "rec-2", kwhConsumed: 5 }),
        )
    })
})