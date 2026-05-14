import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { ReportRecordsTable } from "@/components/report/ReportRecordsTable"
import type { ConsumptionRecord } from "@/types/consumption.types"

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

describe("ReportRecordsTable — estrutura", () => {
    it("renderiza header com Período, Data, kWh, Custo", () => {
        render(<ReportRecordsTable records={[]} />)

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

    it("NUNCA renderiza coluna 'Ações' (componente é read-only)", () => {
        render(<ReportRecordsTable records={[baseRecord]} />)

        expect(
            screen.queryByRole("columnheader", { name: /ações/i }),
        ).toBeNull()
    })

    it("renderiza tabela vazia (só o header) quando records=[]", () => {
        render(<ReportRecordsTable records={[]} />)

        expect(
            screen.getByTestId("report-records-table"),
        ).toBeInTheDocument()
        expect(screen.queryByTestId(/^report-record-row-/)).toBeNull()
    })
})

describe("ReportRecordsTable — linhas", () => {
    it("renderiza uma linha por record com testid baseado no id", () => {
        const records = [
            { ...baseRecord, id: "rec-1" },
            { ...baseRecord, id: "rec-2" },
        ]
        render(<ReportRecordsTable records={records} />)

        expect(screen.getByTestId("report-record-row-rec-1")).toBeInTheDocument()
        expect(screen.getByTestId("report-record-row-rec-2")).toBeInTheDocument()
    })

    it("renderiza label do period traduzida", () => {
        render(<ReportRecordsTable records={[baseRecord]} />)

        const row = screen.getByTestId("report-record-row-rec-1")
        expect(within(row).getByText("Dia")).toBeInTheDocument()
    })

    it("renderiza data formatada conforme o period", () => {
        render(<ReportRecordsTable records={[baseRecord]} />)

        const row = screen.getByTestId("report-record-row-rec-1")
        expect(within(row).getByText("15/01/2025")).toBeInTheDocument()
    })

    it("renderiza kWh formatado", () => {
        render(<ReportRecordsTable records={[baseRecord]} />)

        const row = screen.getByTestId("report-record-row-rec-1")
        expect(within(row).getByText("12,50")).toBeInTheDocument()
    })

    it("renderiza '—' quando costBrl é null", () => {
        render(
            <ReportRecordsTable
                records={[{ ...baseRecord, costBrl: null }]}
            />,
        )

        const row = screen.getByTestId("report-record-row-rec-1")
        expect(within(row).getByText("—")).toBeInTheDocument()
    })

    it("renderiza ícone de notes quando há notes", () => {
        render(
            <ReportRecordsTable
                records={[{ ...baseRecord, notes: "Pico inverno" }]}
            />,
        )

        const icon = screen.getByTestId(
            "report-record-row-rec-1-notes-icon",
        )
        expect(icon).toHaveAttribute("title", "Pico inverno")
    })

    it("não renderiza ícone de notes quando notes é null/vazio", () => {
        render(<ReportRecordsTable records={[baseRecord]} />)
        expect(
            screen.queryByTestId("report-record-row-rec-1-notes-icon"),
        ).toBeNull()
    })

    it("renderiza period MONTHLY como 'Janeiro de 2025'", () => {
        const record: ConsumptionRecord = {
            ...baseRecord,
            period: "MONTHLY",
            referenceDate: "2025-01-15T12:00:00.000Z",
        }
        render(<ReportRecordsTable records={[record]} />)

        const row = screen.getByTestId("report-record-row-rec-1")
        expect(within(row).getByText("Janeiro de 2025")).toBeInTheDocument()
    })
})