import { describe, it, expect } from "vitest"
import {
    buildReportCsv,
    buildCsvFilename,
    escapeCsvCell,
} from "@/lib/csv/reportCsv"
import type { ReportResult } from "@/types/report.types"
import type { ConsumptionRecord } from "@/types/consumption.types"

const baseRecord: ConsumptionRecord = {
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
}

const baseResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "abc12345-6789-...-uuid" },
    dateRange: { from: "2025-01-01", to: "2025-12-31" },
    summary: {
        totalKwh: 123.45,
        totalCostBrl: 75,
        recordCount: 2,
        avgKwhPerRecord: 61.725,
        trend: "STABLE",
    },
    records: [baseRecord],
}

const baseEntity = {
    artigo: "desta" as const,
    nome: "propriedade",
}

// ─────────────────────────────────────────────────────────────────────────────
// escapeCsvCell
// ─────────────────────────────────────────────────────────────────────────────

describe("escapeCsvCell", () => {
    it("retorna a string inalterada quando não há chars especiais", () => {
        expect(escapeCsvCell("foo bar")).toBe("foo bar")
    })

    it("envolve em aspas quando contém vírgula", () => {
        expect(escapeCsvCell("foo,bar")).toBe('"foo,bar"')
    })

    it("envolve em aspas e duplica aspas internas", () => {
        expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""')
    })

    it("envolve em aspas quando contém quebra de linha", () => {
        expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"')
    })

    it("envolve em aspas quando contém carriage return", () => {
        expect(escapeCsvCell("a\rb")).toBe('"a\rb"')
    })

    it("trata string vazia (não envolve)", () => {
        expect(escapeCsvCell("")).toBe("")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildCsvFilename
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCsvFilename", () => {
    const fixedNow = new Date(2026, 4, 13, 10, 0) // 13/05/2026

    it("inclui prefixo 'relatorio_' e data ISO", () => {
        const name = buildCsvFilename(baseResult, fixedNow)
        expect(name).toMatch(/^relatorio_/)
        expect(name).toMatch(/2026-05-13\.csv$/)
    })

    it("inclui 'property_' + 8 chars do UUID quando target é PROPERTY", () => {
        const name = buildCsvFilename(baseResult, fixedNow)
        expect(name).toContain("property_abc12345")
    })

    it("inclui 'area_' + 8 chars quando target é AREA", () => {
        const areaResult: ReportResult = {
            ...baseResult,
            target: {
                type: "AREA",
                propertyId: "prop-xxx",
                areaId: "area-1234567890",
            },
        }

        const name = buildCsvFilename(areaResult, fixedNow)
        expect(name).toContain("area_area-123")
    })

    it("inclui 'device_' + 8 chars quando target é DEVICE", () => {
        const deviceResult: ReportResult = {
            ...baseResult,
            target: {
                type: "DEVICE",
                propertyId: "p",
                areaId: "a",
                deviceId: "device-XYZ-12345",
            },
        }

        const name = buildCsvFilename(deviceResult, fixedNow)
        expect(name).toContain("device_device-X")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildReportCsv — estrutura
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReportCsv — estrutura", () => {
    it("começa com BOM UTF-8 (\\uFEFF) para Excel-pt-BR", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv.charCodeAt(0)).toBe(0xfeff)
    })

    it("usa CRLF como separador de linhas (RFC 4180)", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv).toContain("\r\n")
    })

    it("tem 9 linhas de meta + 1 vazia + header + 1 record = 12 linhas", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        expect(lines).toHaveLength(12)
    })

    it("inclui linha vazia separando meta do header", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        // 9 linhas de meta (0..8) + linha 9 vazia
        expect(lines[9]).toBe("")
    })

    it("header da tabela está na linha 10 (após meta + vazia)", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        expect(lines[10]).toBe("Período,Data,kWh,Custo (BRL),Observações")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildReportCsv — meta
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReportCsv — meta", () => {
    it("inclui alvo com artigo e nome da entidade", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv).toContain("Alvo,Relatório desta propriedade")
    })

    it("usa 'deste dispositivo' para device", () => {
        const csv = buildReportCsv(baseResult, {
            artigo: "deste",
            nome: "dispositivo",
        })
        expect(csv).toContain("Alvo,Relatório deste dispositivo")
    })

    it("inclui período em pt-BR (Mensal/Diário/Anual)", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv).toContain("Período,Mensal")
    })

    it("inclui intervalo formatado quando dateRange existe", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv).toContain("01/01/2025 – 31/12/2025")
    })

    it("inclui 'Todos os registros' quando dateRange é null", () => {
        const csv = buildReportCsv(
            { ...baseResult, dateRange: null },
            baseEntity,
        )
        expect(csv).toContain("Intervalo,Todos os registros")
    })

    it("inclui custo total formatado como moeda BRL", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        // R$ 75,00 — contém vírgula no decimal → célula entre aspas
        // (ver teste de escape abaixo)
        expect(csv).toContain("Custo total (BRL)")
        expect(csv).toMatch(/R\$\s75,00/)
    })

    it("inclui tendência traduzida (Estável/Em alta/Em queda)", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        expect(csv).toContain("Tendência,Estável")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildReportCsv — registros
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReportCsv — registros", () => {
    it("renderiza 1 linha por record após o header", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [
                { ...baseRecord, id: "r1" },
                { ...baseRecord, id: "r2" },
                { ...baseRecord, id: "r3" },
            ],
        }
        const csv = buildReportCsv(result, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        // 9 meta + 1 vazia + 1 header + 3 records = 14 linhas
        expect(lines).toHaveLength(14)
    })

    it("renderiza tabela vazia (só header) quando records=[]", () => {
        const csv = buildReportCsv(
            { ...baseResult, records: [] },
            baseEntity,
        )
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        // 9 meta + 1 vazia + 1 header = 11 linhas, sem dados
        expect(lines).toHaveLength(11)
    })

    it("célula com vírgula decimal é envolvida em aspas", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [{ ...baseRecord, kwhConsumed: 12.5, costBrl: 9.375 }],
        }
        const csv = buildReportCsv(result, baseEntity)
        // 12,50 contém vírgula → entre aspas
        expect(csv).toContain('"12,50"')
    })

    it("notes vazia vira célula vazia (sem 'null')", () => {
        const csv = buildReportCsv(baseResult, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        const dataRow = lines[11]
        // Última coluna = Observações → string vazia, então a linha
        // termina com vírgula (último valor vazio)
        expect(dataRow.endsWith(",")).toBe(true)
        expect(dataRow).not.toContain("null")
    })

    it("notes com vírgula é escapada corretamente", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [
                { ...baseRecord, notes: "Pico, inverno" },
            ],
        }
        const csv = buildReportCsv(result, baseEntity)
        expect(csv).toContain('"Pico, inverno"')
    })

    it("notes com aspas duplica as aspas (escape RFC 4180)", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [
                { ...baseRecord, notes: 'Anomalia "tipo A"' },
            ],
        }
        const csv = buildReportCsv(result, baseEntity)
        expect(csv).toContain('"Anomalia ""tipo A"""')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Segurança / edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReportCsv — edge cases", () => {
    it("não quebra com record contendo quebras de linha em notes", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [
                { ...baseRecord, notes: "Linha1\nLinha2" },
            ],
        }
        const csv = buildReportCsv(result, baseEntity)
        // A célula com \n é envolvida em aspas → não corrompe a estrutura
        expect(csv).toContain('"Linha1\nLinha2"')
    })

    it("trata costBrl=null como '—' (igual à UI)", () => {
        const result: ReportResult = {
            ...baseResult,
            records: [{ ...baseRecord, costBrl: null }],
        }
        const csv = buildReportCsv(result, baseEntity)
        const lines = csv.replace(/^\uFEFF/, "").split("\r\n")
        // O formatador retorna "—" — a célula é escrita inalterada
        expect(lines[11]).toContain("—")
    })
})