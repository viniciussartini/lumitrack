import { describe, it, expect } from "vitest"
import {
    formatReferenceDate,
    formatKwh,
    formatCostBrl,
} from "@/lib/formatters/consumption"

// ─────────────────────────────────────────────────────────────────────────────
// formatReferenceDate
// ─────────────────────────────────────────────────────────────────────────────
//
// Notas sobre timezone: ao usar T12:00:00.000Z (meio-dia UTC), garantimos
// que mesmo ambientes em timezones do Brasil (UTC-3) ficam no mesmo dia.
// Para HOURLY testamos o padrão (HH:MM presente) sem fixar a hora exata —
// ela varia conforme TZ do ambiente de teste.

describe("formatReferenceDate (HOURLY)", () => {
    it("retorna data e hora no formato pt-BR", () => {
        const result = formatReferenceDate("2025-01-15T14:00:00.000Z", "HOURLY")
        expect(result).toMatch(/15\/01\/2025/)
        expect(result).toMatch(/\d{2}:\d{2}/)
    })
})

describe("formatReferenceDate (DAILY)", () => {
    it("retorna apenas a data, sem hora", () => {
        expect(
            formatReferenceDate("2025-01-15T12:00:00.000Z", "DAILY"),
        ).toBe("15/01/2025")
    })
})

describe("formatReferenceDate (MONTHLY)", () => {
    it("retorna mês por extenso capitalizado e ano", () => {
        expect(
            formatReferenceDate("2025-01-15T12:00:00.000Z", "MONTHLY"),
        ).toBe("Janeiro de 2025")
    })

    it("capitaliza outros meses (não só janeiro)", () => {
        expect(
            formatReferenceDate("2025-03-15T12:00:00.000Z", "MONTHLY"),
        ).toBe("Março de 2025")
    })
})

describe("formatReferenceDate (ANNUAL)", () => {
    it("retorna apenas o ano", () => {
        expect(
            formatReferenceDate("2025-06-30T12:00:00.000Z", "ANNUAL"),
        ).toBe("2025")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatKwh
// ─────────────────────────────────────────────────────────────────────────────

describe("formatKwh", () => {
    it("formata número com vírgula decimal e mínimo 2 casas (12.5 → '12,50')", () => {
        expect(formatKwh(12.5)).toBe("12,50")
    })

    it("permite até 3 casas decimais quando o número precisa (0.125 → '0,125')", () => {
        expect(formatKwh(0.125)).toBe("0,125")
    })

    it("formata zero com 2 casas ('0,00')", () => {
        expect(formatKwh(0)).toBe("0,00")
    })

    it("usa separador de milhares pt-BR (12345.6 → '12.345,60')", () => {
        expect(formatKwh(12345.6)).toBe("12.345,60")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatCostBrl
// ─────────────────────────────────────────────────────────────────────────────

describe("formatCostBrl", () => {
    it("formata valor como moeda BRL", () => {
        const result = formatCostBrl(9.5)
        // Intl pt-BR insere NBSP (U+00A0) entre R$ e número — \s pega NBSP.
        expect(result).toMatch(/R\$\s9,50/)
    })

    it("arredonda para 2 casas (Intl currency default: 9.375 → 'R$ 9,38')", () => {
        const result = formatCostBrl(9.375)
        expect(result).toMatch(/R\$\s9,38/)
    })

    it("retorna '—' (em-dash) quando o custo é null", () => {
        expect(formatCostBrl(null)).toBe("—")
    })

    it("formata zero como 'R$ 0,00' (não vira em-dash — 0 ≠ null)", () => {
        const result = formatCostBrl(0)
        expect(result).toMatch(/R\$\s0,00/)
    })
})