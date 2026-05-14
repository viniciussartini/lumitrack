import { describe, it, expect } from "vitest"
import {
    thisMonthRange,
    last30DaysRange,
    thisYearRange,
    detectActivePreset,
    DATE_PRESETS,
} from "@/lib/date/datePresets"

// ─────────────────────────────────────────────────────────────────────────────
// thisMonthRange
// ─────────────────────────────────────────────────────────────────────────────

describe("thisMonthRange", () => {
    it("retorna do dia 1 do mês até hoje", () => {
        // Quarta, 13/05/2026. Mid-mês — caso comum.
        const now = new Date(2026, 4, 13, 14, 30) // mês 4 = maio (0-indexed)
        const result = thisMonthRange(now)

        expect(result.dateFrom).toBe("2026-05-01")
        expect(result.dateTo).toBe("2026-05-13")
    })

    it("trata o dia 1 do mês (dateFrom === dateTo)", () => {
        const now = new Date(2026, 4, 1, 10, 0)
        const result = thisMonthRange(now)

        expect(result.dateFrom).toBe("2026-05-01")
        expect(result.dateTo).toBe("2026-05-01")
    })

    it("trata o último dia do mês (sem virar pro mês seguinte)", () => {
        // Caso clássico de bug com UTC: 31/01 às 21h em America/Sao_Paulo
        // vira 01/02 em UTC. Testamos com timezone local injetado.
        const now = new Date(2026, 0, 31, 21, 0) // 31/01/2026 21:00 local
        const result = thisMonthRange(now)

        expect(result.dateFrom).toBe("2026-01-01")
        expect(result.dateTo).toBe("2026-01-31")
    })

    it("trata ano bissexto — fevereiro com 29 dias", () => {
        const now = new Date(2024, 1, 29, 12, 0) // 29/02/2024
        const result = thisMonthRange(now)

        expect(result.dateFrom).toBe("2024-02-01")
        expect(result.dateTo).toBe("2024-02-29")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// last30DaysRange
// ─────────────────────────────────────────────────────────────────────────────

describe("last30DaysRange", () => {
    it("retorna 29 dias antes de hoje + hoje = 30 dias", () => {
        const now = new Date(2026, 4, 30, 10, 0) // 30/05/2026
        const result = last30DaysRange(now)

        expect(result.dateFrom).toBe("2026-05-01")
        expect(result.dateTo).toBe("2026-05-30")
    })

    it("atravessa a fronteira de mês corretamente", () => {
        const now = new Date(2026, 4, 13, 12, 0) // 13/05/2026
        const result = last30DaysRange(now)

        // 29 dias antes de 13/05 = 14/04
        expect(result.dateFrom).toBe("2026-04-14")
        expect(result.dateTo).toBe("2026-05-13")
    })

    it("atravessa a fronteira de ano corretamente", () => {
        const now = new Date(2026, 0, 15, 10, 0) // 15/01/2026
        const result = last30DaysRange(now)

        // 29 dias antes de 15/01/2026 = 17/12/2025
        expect(result.dateFrom).toBe("2025-12-17")
        expect(result.dateTo).toBe("2026-01-15")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// thisYearRange
// ─────────────────────────────────────────────────────────────────────────────

describe("thisYearRange", () => {
    it("retorna 1º de janeiro até hoje", () => {
        const now = new Date(2026, 4, 13, 14, 0)
        const result = thisYearRange(now)

        expect(result.dateFrom).toBe("2026-01-01")
        expect(result.dateTo).toBe("2026-05-13")
    })

    it("retorna 01/01 ao 01/01 quando estamos no primeiro dia do ano", () => {
        const now = new Date(2026, 0, 1, 0, 1)
        const result = thisYearRange(now)

        expect(result.dateFrom).toBe("2026-01-01")
        expect(result.dateTo).toBe("2026-01-01")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DATE_PRESETS — metadados
// ─────────────────────────────────────────────────────────────────────────────

describe("DATE_PRESETS", () => {
    it("tem 3 presets na ordem: this-month, last-30-days, this-year", () => {
        expect(DATE_PRESETS.map((p) => p.id)).toEqual([
            "this-month",
            "last-30-days",
            "this-year",
        ])
    })

    it("cada preset tem label em pt-BR", () => {
        const labels = DATE_PRESETS.map((p) => p.label)
        expect(labels).toContain("Este mês")
        expect(labels).toContain("Últimos 30 dias")
        expect(labels).toContain("Este ano")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectActivePreset
// ─────────────────────────────────────────────────────────────────────────────

describe("detectActivePreset", () => {
    const NOW = new Date(2026, 4, 13, 14, 0) // 13/05/2026

    it("retorna undefined quando dateFrom ou dateTo faltam", () => {
        expect(detectActivePreset(undefined, "2026-05-13", NOW)).toBeUndefined()
        expect(detectActivePreset("2026-05-01", undefined, NOW)).toBeUndefined()
        expect(detectActivePreset(undefined, undefined, NOW)).toBeUndefined()
    })

    it("detecta 'this-month' quando o range bate exatamente", () => {
        expect(
            detectActivePreset("2026-05-01", "2026-05-13", NOW),
        ).toBe("this-month")
    })

    it("detecta 'last-30-days' quando o range bate", () => {
        expect(
            detectActivePreset("2026-04-14", "2026-05-13", NOW),
        ).toBe("last-30-days")
    })

    it("detecta 'this-year' quando o range bate", () => {
        expect(
            detectActivePreset("2026-01-01", "2026-05-13", NOW),
        ).toBe("this-year")
    })

    it("retorna undefined para range customizado (1 dia de diferença)", () => {
        // 30/04 a 13/05 — quase "this-month" mas não exatamente
        expect(
            detectActivePreset("2026-04-30", "2026-05-13", NOW),
        ).toBeUndefined()
    })

    it("retorna undefined para range totalmente arbitrário", () => {
        expect(
            detectActivePreset("2025-06-15", "2025-08-20", NOW),
        ).toBeUndefined()
    })
})