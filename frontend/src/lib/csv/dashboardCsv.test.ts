import { describe, it, expect } from "vitest"
import {
    buildDashboardCsv,
    buildDashboardCsvFilename,
} from "@/lib/csv/dashboardCsv"
import type { DashboardData, DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportFilters, ReportResult } from "@/types/report.types"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mock
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 4, 13, 12, 0) // 13/05/2026 12:00

const makeResult = (overrides: Partial<ReportResult> = {}): ReportResult => ({
    generatedAt: NOW.toISOString(),
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "p1" },
    dateRange: null,
    summary: {
        totalKwh: 123.45,
        totalCostBrl: 67.89,
        recordCount: 3,
        avgKwhPerRecord: 41.15,
        trend: "STABLE",
    },
    records: [],
    ...overrides,
})

const makeSuccessEntry = (
    overrides: Partial<DashboardPropertyEntry> = {},
): DashboardPropertyEntry => ({
    propertyId: "p1",
    propertyName: "Casa",
    status: "success",
    result: makeResult(),
    error: null,
    ...overrides,
})

const makeErrorEntry = (
    name = "Escritório",
    error = "Falha de rede",
): DashboardPropertyEntry => ({
    propertyId: "p2",
    propertyName: name,
    status: "error",
    result: null,
    error,
})

const baseData: DashboardData = {
    summary: {
        totalKwh: 300,
        totalCostBrl: 150,
        recordCount: 4,
        propertyCount: 2,
        propertyWithDataCount: 2,
        trendBreakdown: {
            increasing: 1,
            decreasing: 0,
            stable: 1,
            insufficient: 0,
        },
    },
    perProperty: [
        makeSuccessEntry({
            propertyId: "p1",
            propertyName: "Casa",
            result: makeResult({
                summary: {
                    totalKwh: 200,
                    totalCostBrl: 100,
                    recordCount: 2,
                    avgKwhPerRecord: 100,
                    trend: "INCREASING",
                },
            }),
        }),
        makeSuccessEntry({
            propertyId: "p2",
            propertyName: "Escritório",
            result: makeResult({
                summary: {
                    totalKwh: 100,
                    totalCostBrl: 50,
                    recordCount: 2,
                    avgKwhPerRecord: 50,
                    trend: "STABLE",
                },
            }),
        }),
    ],
    timeSeries: [],
}

const baseFilters: ReportFilters = { period: "MONTHLY" }

// Utilitário: split respeitando BOM
const splitLines = (csv: string) =>
    csv.replace(/^\uFEFF/, "").split("\r\n")

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsvFilename
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsvFilename", () => {
    it("usa prefixo 'dashboard_' com period em minúsculas e data ISO", () => {
        const name = buildDashboardCsvFilename({ period: "MONTHLY" }, NOW)
        expect(name).toBe("dashboard_monthly_2026-05-13.csv")
    })

    it("adapta o period corretamente para DAILY e ANNUAL", () => {
        expect(
            buildDashboardCsvFilename({ period: "DAILY" }, NOW),
        ).toMatch(/^dashboard_daily_/)

        expect(
            buildDashboardCsvFilename({ period: "ANNUAL" }, NOW),
        ).toMatch(/^dashboard_annual_/)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — codificação
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — codificação", () => {
    it("começa com BOM UTF-8 para Excel-pt-BR", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv.charCodeAt(0)).toBe(0xfeff)
    })

    it("usa CRLF como separador de linhas (RFC 4180)", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("\r\n")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — estrutura
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — estrutura", () => {
    it("tem 7 linhas de meta + 1 vazia + 1 header + N linhas de dados", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)

        // 7 meta + 1 vazia + 1 header + 2 propriedades = 11
        expect(lines).toHaveLength(11)
    })

    it("linha 7 (índice 7) é vazia — separador entre meta e tabela", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)
        expect(lines[7]).toBe("")
    })

    it("header da tabela está na linha 8 (índice 8)", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)
        expect(lines[8]).toBe(
            "Propriedade,Consumo (kWh),Custo (BRL),Registros,Tendência,Status",
        )
    })

    it("dados de propriedades começam na linha 9 (índice 9)", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)
        expect(lines[9]).toContain("Casa")
        expect(lines[10]).toContain("Escritório")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — metadados
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — metadados", () => {
    it("inclui 'Período' com label em pt-BR", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("Período,Mensal")
    })

    it("inclui 'Intervalo' como 'Todos os registros' quando sem datas", () => {
        const csv = buildDashboardCsv(baseData, { period: "MONTHLY" }, NOW)
        expect(csv).toContain("Intervalo,Todos os registros")
    })

    it("inclui 'Intervalo' formatado quando filtros têm datas", () => {
        const filters: ReportFilters = {
            period: "MONTHLY",
            dateFrom: "2025-01-01",
            dateTo: "2025-12-31",
        }
        const csv = buildDashboardCsv(baseData, filters, NOW)
        expect(csv).toContain("01/01/2025 – 31/12/2025")
    })

    it("inclui 'Gerado em' formatado", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("Gerado em")
        expect(csv).toContain("13/05/2026")
    })

    it("inclui total de propriedades e propriedades com dados", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("Total de propriedades,2")
        expect(csv).toContain("Propriedades com dados,2")
    })

    it("inclui consumo e custo totais formatados", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("Consumo total (kWh)")
        expect(csv).toContain("300,00")
        expect(csv).toContain("Custo total (BRL)")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — linhas de dados (sucesso)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — linhas de sucesso", () => {
    it("inclui nome da propriedade, kWh, custo, registros, tendência e 'OK'", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)
        const casaLine = lines[9]!

        expect(casaLine).toContain("Casa")
        expect(casaLine).toContain("200,00")
        expect(casaLine).toContain("2")
        expect(casaLine).toContain("Em alta")
        expect(casaLine).toContain("OK")
    })

    it("tendência STABLE aparece como 'Estável'", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        expect(csv).toContain("Estável")
    })

    it("custo com vírgula decimal é escapado com aspas (RFC 4180)", () => {
        const data: DashboardData = {
            ...baseData,
            perProperty: [
                makeSuccessEntry({
                    result: makeResult({
                        summary: {
                            totalKwh: 12.5,
                            totalCostBrl: 9.375,
                            recordCount: 1,
                            avgKwhPerRecord: 12.5,
                            trend: "STABLE",
                        },
                    }),
                }),
            ],
        }
        const csv = buildDashboardCsv(data, baseFilters, NOW)
        expect(csv).toContain('"12,50"')
    })

    it("preserva a ordem do ranking (maior kWh primeiro)", () => {
        const csv = buildDashboardCsv(baseData, baseFilters, NOW)
        const lines = splitLines(csv)
        // Casa (200 kWh) deve vir antes de Escritório (100 kWh)
        const casaIdx = lines.findIndex((l) => l.includes("Casa"))
        const escritorioIdx = lines.findIndex((l) => l.includes("Escritório"))
        expect(casaIdx).toBeLessThan(escritorioIdx)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — linhas de erro (indisponível)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — linhas de erro", () => {
    it("preenche células numéricas com '—' e Status com a mensagem de erro", () => {
        const data: DashboardData = {
            ...baseData,
            perProperty: [makeErrorEntry("Galpão", "Timeout de rede")],
        }

        const csv = buildDashboardCsv(data, baseFilters, NOW)
        const lines = splitLines(csv)
        const errorLine = lines[9]!

        expect(errorLine).toContain("Galpão")
        expect(errorLine).toContain("Timeout de rede")
        // Campos numéricos como "—"
        expect(errorLine).toContain("—,—,—,—")
    })

    it("usa 'Indisponível' quando error é null", () => {
        const data: DashboardData = {
            ...baseData,
            perProperty: [
                { ...makeErrorEntry("X"), error: null },
            ],
        }
        const csv = buildDashboardCsv(data, baseFilters, NOW)
        expect(csv).toContain("Indisponível")
    })

    it("mix de sucesso e erro produz ambos os tipos de linha", () => {
        const data: DashboardData = {
            ...baseData,
            perProperty: [
                makeSuccessEntry({ propertyId: "p1", propertyName: "Casa" }),
                makeErrorEntry("Erro"),
            ],
        }
        const csv = buildDashboardCsv(data, baseFilters, NOW)

        expect(csv).toContain("OK")
        expect(csv).toContain("Falha de rede")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardCsv — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardCsv — edge cases", () => {
    it("sem propriedades: só meta + vazia + header (9 linhas)", () => {
        const empty: DashboardData = {
            ...baseData,
            perProperty: [],
            summary: {
                ...baseData.summary,
                propertyCount: 0,
                propertyWithDataCount: 0,
                totalKwh: 0,
                totalCostBrl: 0,
            },
        }
        const csv = buildDashboardCsv(empty, baseFilters, NOW)
        const lines = splitLines(csv)
        expect(lines).toHaveLength(9) // 7 meta + 1 vazia + 1 header
    })

    it("nome de propriedade com vírgula é escapado corretamente", () => {
        const data: DashboardData = {
            ...baseData,
            perProperty: [
                makeSuccessEntry({
                    propertyName: "Casa, Lote 1",
                }),
            ],
        }
        const csv = buildDashboardCsv(data, baseFilters, NOW)
        expect(csv).toContain('"Casa, Lote 1"')
    })
})