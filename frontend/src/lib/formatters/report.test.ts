import { describe, it, expect } from "vitest"
import {
    formatGeneratedAt,
    formatReportDate,
    REPORT_TREND_LABELS,
    REPORT_TREND_COLORS,
} from "@/lib/formatters/report"

// ─────────────────────────────────────────────────────────────────────────────
// formatGeneratedAt
// ─────────────────────────────────────────────────────────────────────────────

describe("formatGeneratedAt", () => {
    it("formata um timestamp ISO em DD/MM/AAAA HH:MM (pt-BR)", () => {
        const result = formatGeneratedAt("2025-01-15T14:30:00.000Z")
        // Não fixamos a hora exata porque depende do TZ do ambiente de teste,
        // só o padrão "data + hora:minuto".
        expect(result).toMatch(/15\/01\/2025/)
        expect(result).toMatch(/\d{2}:\d{2}/)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatReportDate
// ─────────────────────────────────────────────────────────────────────────────

describe("formatReportDate", () => {
    it("formata datetime ISO em DD/MM/AAAA", () => {
        expect(formatReportDate("2025-01-15T12:00:00.000Z")).toBe(
            "15/01/2025",
        )
    })

    it("formata date puro YYYY-MM-DD sem deslocamento de timezone", () => {
        // Esse é o caso crítico: parsear "2025-01-15" como UTC daria
        // "14/01/2025" em America/Sao_Paulo (UTC-3). O safe path injeta
        // T12:00:00Z, mantendo o mesmo dia em qualquer TZ do Brasil.
        expect(formatReportDate("2025-01-15")).toBe("15/01/2025")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// REPORT_TREND_LABELS / REPORT_TREND_COLORS
// ─────────────────────────────────────────────────────────────────────────────

describe("REPORT_TREND_LABELS", () => {
    it("tem label para todas as variantes de trend", () => {
        expect(REPORT_TREND_LABELS.INCREASING).toBe("Em alta")
        expect(REPORT_TREND_LABELS.DECREASING).toBe("Em queda")
        expect(REPORT_TREND_LABELS.STABLE).toBe("Estável")
        expect(REPORT_TREND_LABELS.INSUFFICIENT_DATA).toBe(
            "Dados insuficientes",
        )
    })
})

describe("REPORT_TREND_COLORS", () => {
    it("mapeia DECREASING para 'good' (semântica de consumo: queda é positivo)", () => {
        expect(REPORT_TREND_COLORS.DECREASING).toBe("good")
    })

    it("mapeia INCREASING para 'warning' (subindo merece atenção)", () => {
        expect(REPORT_TREND_COLORS.INCREASING).toBe("warning")
    })

    it("mapeia STABLE e INSUFFICIENT_DATA para tons neutros", () => {
        expect(REPORT_TREND_COLORS.STABLE).toBe("neutral")
        expect(REPORT_TREND_COLORS.INSUFFICIENT_DATA).toBe("muted")
    })
})