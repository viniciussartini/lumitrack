import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReportActions } from "@/components/report/ReportActions"
import { downloadFile } from "@/lib/download/downloadFile"
import type { ReportResult } from "@/types/report.types"

vi.mock("@/lib/download/downloadFile", () => ({
    downloadFile: vi.fn(),
}))

const baseResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "abc12345-uuid" },
    dateRange: { from: "2025-01-01", to: "2025-12-31" },
    summary: {
        totalKwh: 100,
        totalCostBrl: 75,
        recordCount: 1,
        avgKwhPerRecord: 100,
        trend: "STABLE",
    },
    records: [
        {
            id: "rec-1",
            propertyId: "prop-1",
            areaId: null,
            deviceId: null,
            period: "MONTHLY",
            referenceDate: "2025-01-15T12:00:00.000Z",
            kwhConsumed: 100,
            costBrl: 75,
            notes: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ],
}

const baseEntity = { artigo: "desta" as const, nome: "propriedade" }

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ReportActions — render", () => {
    it("renderiza os 2 botões", () => {
        render(<ReportActions result={baseResult} entityLabel={baseEntity} />)

        expect(screen.getByTestId("report-action-print")).toBeInTheDocument()
        expect(screen.getByTestId("report-action-csv")).toBeInTheDocument()
    })

    it("usa labels em pt-BR", () => {
        render(<ReportActions result={baseResult} entityLabel={baseEntity} />)

        expect(screen.getByText("Imprimir")).toBeInTheDocument()
        expect(screen.getByText("Exportar CSV")).toBeInTheDocument()
    })

    it("aplica classe 'print-hide' no wrapper para sumir no print", () => {
        render(<ReportActions result={baseResult} entityLabel={baseEntity} />)

        expect(
            screen.getByTestId("report-actions").className,
        ).toMatch(/print-hide/)
    })
})

describe("ReportActions — Imprimir", () => {
    it("aciona window.print() ao clicar em 'Imprimir'", async () => {
        const user = userEvent.setup()
        const printSpy = vi.fn()
        vi.stubGlobal("print", printSpy)

        render(<ReportActions result={baseResult} entityLabel={baseEntity} />)
        await user.click(screen.getByTestId("report-action-print"))

        expect(printSpy).toHaveBeenCalledTimes(1)

        vi.unstubAllGlobals()
    })
})

describe("ReportActions — Exportar CSV", () => {
    it("chama downloadFile com filename, mimeType e CSV completo", async () => {
        const user = userEvent.setup()

        render(<ReportActions result={baseResult} entityLabel={baseEntity} />)
        await user.click(screen.getByTestId("report-action-csv"))

        expect(downloadFile).toHaveBeenCalledTimes(1)
        const [filename, mimeType, content] = vi.mocked(downloadFile).mock
            .calls[0]
        expect(filename).toMatch(/^relatorio_property_abc12345_/)
        expect(mimeType).toBe("text/csv;charset=utf-8")
        // BOM UTF-8 no começo + metadados do relatório dentro do conteúdo
        expect(content.charCodeAt(0)).toBe(0xfeff)
        expect(content).toContain("Alvo,Relatório desta propriedade")
    })

    it("usa 'deste dispositivo' no CSV quando entityLabel indica device", async () => {
        const user = userEvent.setup()

        render(
            <ReportActions
                result={baseResult}
                entityLabel={{ artigo: "deste", nome: "dispositivo" }}
            />,
        )
        await user.click(screen.getByTestId("report-action-csv"))

        const [, , content] = vi.mocked(downloadFile).mock.calls[0]
        expect(content).toContain("Alvo,Relatório deste dispositivo")
    })
})