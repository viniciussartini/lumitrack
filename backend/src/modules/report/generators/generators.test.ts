import { describe, it, expect } from "vitest"
import { generateReportCsv } from "@/modules/report/generators/reportCsv.js"
import { generateReportPdf } from "@/modules/report/generators/reportPdf.js"
import { buildReportFileName } from "@/modules/report/generators/format.js"
import type { ReportData } from "@/modules/report/report.types.js"

function buildData(overrides: Partial<ReportData> = {}): ReportData {
    return {
        type: "MONTHLY",
        generatedAt: new Date("2026-08-01T09:00:00.000Z"),
        target: { kind: "Propriedade", name: "Casa Jardins" },
        property: {
            name: "Casa Jardins",
            distributorName: "Enel SP",
            tariffLabel: "Grupo B · B1",
        },
        period: {
            from: new Date("2026-07-01T03:00:00.000Z"),
            to: new Date("2026-08-01T03:00:00.000Z"),
        },
        kpis: {
            totalKwh: 440.5,
            averageDailyKwh: 14.2,
            peakDay: { day: new Date("2026-07-12T00:00:00.000Z"), kwhConsumed: 19.4 },
        },
        daily: [
            { day: new Date("2026-07-01T00:00:00.000Z"), kwhConsumed: 14.2, avgPowerW: 590 },
            { day: new Date("2026-07-02T00:00:00.000Z"), kwhConsumed: 13.6, avgPowerW: 567 },
        ],
        children: {
            kind: "Ambientes",
            rows: [
                { name: "Sala", kwhConsumed: 128.4, sharePercent: 29.1 },
                { name: "Garagem", kwhConsumed: null, sharePercent: null },
            ],
        },
        monthly: { costBrl: 412.8, previousMonthKwh: 480.9, variationPercent: -8.4 },
        ...overrides,
    }
}

describe("generateReportCsv", () => {
    it("escreve resumo, tabela diária e tabela de filhos", () => {
        const text = generateReportCsv(buildData()).toString("utf8")

        expect(text).toContain("Relatório mensal de consumo de energia")
        expect(text).toContain("Consumo total (kWh);440,5")
        expect(text).toContain("Custo do mês (R$);412,8")
        expect(text).toContain("Variação sobre o mês anterior (%);-8,4")
        expect(text).toContain("01/07/2026;14,2;590")
        expect(text).toContain("Sala;128,4;29,1")
    })

    it("mostra '-' para o que está ausente, nunca zero", () => {
        const text = generateReportCsv(
            buildData({
                kpis: { totalKwh: 0, averageDailyKwh: 0, peakDay: null },
                monthly: { costBrl: null, previousMonthKwh: 0, variationPercent: null },
            }),
        ).toString("utf8")

        expect(text).toContain("Dia de maior consumo;-")
        expect(text).toContain("Custo do mês (R$);-")
        expect(text).toContain("Variação sobre o mês anterior (%);-")
        expect(text).toContain("Garagem;-;-")
    })

    it("omite o bloco mensal e a tabela de filhos quando não se aplicam", () => {
        const text = generateReportCsv(
            buildData({ type: "CONSUMPTION", monthly: null, children: null }),
        ).toString("utf8")

        expect(text).toContain("Relatório de consumo de energia")
        expect(text).not.toContain("Custo do mês")
        expect(text).not.toContain("Participação")
    })

    it("neutraliza nome de propriedade que pareça fórmula", () => {
        const text = generateReportCsv(
            buildData({
                property: { name: "=HYPERLINK(1)", distributorName: null, tariffLabel: "x" },
            }),
        ).toString("utf8")

        expect(text).toContain("'=HYPERLINK(1)")
        expect(text).not.toMatch(/;=HYPERLINK/)
    })
})

describe("generateReportPdf", () => {
    it("gera PDF válido", async () => {
        const buffer = await generateReportPdf(buildData())
        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("gera PDF válido sem leituras e sem filhos", async () => {
        const buffer = await generateReportPdf(
            buildData({
                daily: [],
                children: null,
                monthly: null,
                kpis: { totalKwh: 0, averageDailyKwh: 0, peakDay: null },
            }),
        )
        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("pagina uma tabela de 92 dias sem falhar", async () => {
        const daily = Array.from({ length: 92 }, (_, i) => ({
            day: new Date(Date.UTC(2026, 0, 1 + i)),
            kwhConsumed: 10 + i,
            avgPowerW: 400,
        }))
        const buffer = await generateReportPdf(buildData({ daily }))
        const pages = buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []
        expect(pages.length).toBeGreaterThan(1)
    })
})

describe("buildReportFileName", () => {
    it("usa tipo e mês do período, nunca texto do usuário", () => {
        expect(
            buildReportFileName("MONTHLY", { from: new Date("2026-07-01T03:00:00.000Z") }, "pdf"),
        ).toBe("lumitrack-relatorio-monthly-2026-07.pdf")
    })
})
