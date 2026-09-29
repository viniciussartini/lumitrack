import { describe, expect, it } from "vitest"
import {
    MAX_SCHEDULED_REPORT_PERIOD_DAYS,
    resolveScheduledReportInput,
} from "@/modules/report-schedule/scheduledPeriod.js"

const TARGET = {
    targetType: "PROPERTY",
    targetId: "8f3c1a52-6c1e-4d0a-9d55-3f0f0b1f7a10",
    format: "PDF",
} as const

// 06:00 em São Paulo = 09:00 UTC
const slot = (isoLocal: string) => new Date(`${isoLocal}T09:00:00.000Z`)

function consumption(
    frequency: Parameters<typeof resolveScheduledReportInput>[0]["frequency"],
    at: string,
) {
    const input = resolveScheduledReportInput(
        { ...TARGET, type: "CONSUMPTION", frequency },
        slot(at),
    )
    if (input.type !== "CONSUMPTION") throw new Error("esperado consumo")
    return input
}

describe("resolveScheduledReportInput", () => {
    it("diária cobre o dia local anterior", () => {
        const input = consumption("DAILY", "2026-03-10")
        expect(input.from.toISOString()).toBe("2026-03-09T03:00:00.000Z")
        expect(input.to.toISOString()).toBe("2026-03-10T03:00:00.000Z")
    })

    it("semanal cobre os 7 dias anteriores", () => {
        const input = consumption("WEEKLY", "2026-03-10")
        expect(input.from.toISOString()).toBe("2026-03-03T03:00:00.000Z")
        expect(input.to.toISOString()).toBe("2026-03-10T03:00:00.000Z")
    })

    it("mensal de consumo cobre o intervalo desde o envio anterior", () => {
        const input = consumption("MONTHLY", "2026-03-15")
        expect(input.from.toISOString()).toBe("2026-02-15T03:00:00.000Z")
        expect(input.to.toISOString()).toBe("2026-03-15T03:00:00.000Z")
    })

    it("recua ao último dia do mês curto quando o dia não existe", () => {
        // Envio em 31/03 → um mês antes é 28/02 (2026 não é bissexto).
        expect(consumption("MONTHLY", "2026-03-31").from.toISOString()).toBe(
            "2026-02-28T03:00:00.000Z",
        )
        // Ano bissexto.
        expect(consumption("MONTHLY", "2028-03-31").from.toISOString()).toBe(
            "2028-02-29T03:00:00.000Z",
        )
    })

    it("trimestral, semestral e anual recuam 3, 6 e 12 meses", () => {
        expect(consumption("QUARTERLY", "2026-04-05").from.toISOString()).toBe(
            "2026-01-05T03:00:00.000Z",
        )
        expect(consumption("SEMIANNUAL", "2026-01-10").from.toISOString()).toBe(
            "2025-07-10T03:00:00.000Z",
        )
        expect(consumption("ANNUAL", "2026-01-10").from.toISOString()).toBe(
            "2025-01-10T03:00:00.000Z",
        )
    })

    it("nenhum período de consumo passa do teto", () => {
        for (const frequency of ["SEMIANNUAL", "ANNUAL"] as const) {
            const input = consumption(frequency, "2029-01-31")
            const days = (input.to.getTime() - input.from.getTime()) / 86_400_000
            expect(days).toBeLessThanOrEqual(MAX_SCHEDULED_REPORT_PERIOD_DAYS)
        }
    })

    it("mensal cobre o mês-calendário anterior, inclusive na virada de ano", () => {
        const input = resolveScheduledReportInput(
            { ...TARGET, type: "MONTHLY", frequency: "MONTHLY" },
            slot("2026-01-15"),
        )
        expect(input).toMatchObject({ type: "MONTHLY", month: "2025-12" })
    })

    it("repassa alvo e formato", () => {
        const input = resolveScheduledReportInput(
            { ...TARGET, format: "CSV", type: "MONTHLY", frequency: "MONTHLY" },
            slot("2026-05-02"),
        )
        expect(input).toMatchObject({ ...TARGET, format: "CSV", month: "2026-04" })
    })
})
