import { describe, it, expect } from "vitest"
import {
    parseReportFiltersFromParams,
    serializeReportFiltersToParams,
} from "@/pages/report/reportFiltersUrl"

const defaults = { period: "MONTHLY" as const }

// ─────────────────────────────────────────────────────────────────────────────
// parseReportFiltersFromParams
// ─────────────────────────────────────────────────────────────────────────────

describe("parseReportFiltersFromParams", () => {
    it("retorna defaults quando URL está vazia", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams(),
            defaults,
        )
        expect(result).toEqual({
            period: "MONTHLY",
            dateFrom: undefined,
            dateTo: undefined,
        })
    })

    it("lê period válido da URL", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period=DAILY"),
            defaults,
        )
        expect(result.period).toBe("DAILY")
    })

    it("ignora period inválido e cai no default", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period=HOURLY"),
            defaults,
        )
        expect(result.period).toBe("MONTHLY")
    })

    it("ignora period vazio e cai no default", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period="),
            defaults,
        )
        expect(result.period).toBe("MONTHLY")
    })

    it("lê dateFrom/dateTo válidos da URL", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams(
                "period=MONTHLY&dateFrom=2025-01-01&dateTo=2025-12-31",
            ),
            defaults,
        )
        expect(result.dateFrom).toBe("2025-01-01")
        expect(result.dateTo).toBe("2025-12-31")
    })

    it("ignora dateFrom em formato inválido (não regex YYYY-MM-DD)", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period=MONTHLY&dateFrom=01/01/2025"),
            defaults,
        )
        expect(result.dateFrom).toBeUndefined()
    })

    it("ignora dateTo em formato inválido", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period=MONTHLY&dateTo=invalid"),
            defaults,
        )
        expect(result.dateTo).toBeUndefined()
    })

    it("MANTÉM dateFrom > dateTo (UI sinaliza o erro inline)", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams(
                "period=MONTHLY&dateFrom=2025-06-01&dateTo=2025-01-01",
            ),
            defaults,
        )
        expect(result.dateFrom).toBe("2025-06-01")
        expect(result.dateTo).toBe("2025-01-01")
    })

    it("aceita só dateFrom, sem dateTo", () => {
        const result = parseReportFiltersFromParams(
            new URLSearchParams("period=MONTHLY&dateFrom=2025-01-01"),
            defaults,
        )
        expect(result.dateFrom).toBe("2025-01-01")
        expect(result.dateTo).toBeUndefined()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// serializeReportFiltersToParams
// ─────────────────────────────────────────────────────────────────────────────

describe("serializeReportFiltersToParams", () => {
    it("escreve apenas period quando não há datas", () => {
        const result = serializeReportFiltersToParams({ period: "MONTHLY" })
        expect(result.toString()).toBe("period=MONTHLY")
    })

    it("escreve period + dateFrom + dateTo", () => {
        const result = serializeReportFiltersToParams({
            period: "DAILY",
            dateFrom: "2025-01-01",
            dateTo: "2025-12-31",
        })
        // URLSearchParams preserva ordem de inserção.
        expect(result.toString()).toBe(
            "period=DAILY&dateFrom=2025-01-01&dateTo=2025-12-31",
        )
    })

    it("não emite dateFrom vazio (apenas se preenchido)", () => {
        const result = serializeReportFiltersToParams({
            period: "MONTHLY",
            dateFrom: undefined,
            dateTo: "2025-12-31",
        })
        expect(result.toString()).toBe(
            "period=MONTHLY&dateTo=2025-12-31",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("parse + serialize — round trip", () => {
    it("filtros completos sobrevivem ao round trip", () => {
        const original = {
            period: "ANNUAL" as const,
            dateFrom: "2024-01-01",
            dateTo: "2024-12-31",
        }

        const serialized = serializeReportFiltersToParams(original)
        const parsed = parseReportFiltersFromParams(serialized, {
            period: "MONTHLY",
        })

        expect(parsed).toEqual(original)
    })

    it("filtros sem datas sobrevivem ao round trip", () => {
        const original = { period: "DAILY" as const }

        const serialized = serializeReportFiltersToParams(original)
        const parsed = parseReportFiltersFromParams(serialized, {
            period: "MONTHLY",
        })

        expect(parsed).toEqual({
            period: "DAILY",
            dateFrom: undefined,
            dateTo: undefined,
        })
    })
})