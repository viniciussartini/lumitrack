import { describe, expect, it } from "vitest"
import { MAX_DAILY_BUCKETS } from "@/modules/report/report.service.js"
import { computeNextRun, type ReportFrequency } from "@/modules/report-schedule/nextRun.js"
import {
    LONGEST_SCHEDULED_PERIOD_DAYS,
    resolveScheduledReportInput,
} from "@/modules/report-schedule/scheduledPeriod.js"

const TARGET = {
    targetType: "PROPERTY",
    targetId: "8f3c1a52-6c1e-4d0a-9d55-3f0f0b1f7a10",
    format: "PDF",
} as const

// 06:00 em São Paulo = 09:00 UTC
const slot = (isoLocal: string) => new Date(`${isoLocal}T09:00:00.000Z`)

type Spec = Parameters<typeof resolveScheduledReportInput>[0]

function consumption(frequency: ReportFrequency, at: string, sendDay: number | null = null) {
    const spec: Spec = { ...TARGET, type: "CONSUMPTION", frequency, sendDay }
    const input = resolveScheduledReportInput(spec, slot(at))
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
        const input = consumption("WEEKLY", "2026-03-10", 2)
        expect(input.from.toISOString()).toBe("2026-03-03T03:00:00.000Z")
        expect(input.to.toISOString()).toBe("2026-03-10T03:00:00.000Z")
    })

    it("mensal de consumo cobre o intervalo desde o envio anterior", () => {
        const input = consumption("MONTHLY", "2026-03-15", 15)
        expect(input.from.toISOString()).toBe("2026-02-15T03:00:00.000Z")
        expect(input.to.toISOString()).toBe("2026-03-15T03:00:00.000Z")
    })

    it("o início é o envio anterior do mês curto, não o mesmo dia do slot ajustado", () => {
        // Dia 31 configurado: o slot de 28/02 veio do envio de 31/01, e o de
        // 30/04 veio do de 31/03 (um mês antes do dia ajustado não serve).
        expect(consumption("MONTHLY", "2026-02-28", 31).from.toISOString()).toBe(
            "2026-01-31T03:00:00.000Z",
        )
        expect(consumption("MONTHLY", "2026-04-30", 31).from.toISOString()).toBe(
            "2026-03-31T03:00:00.000Z",
        )
        expect(consumption("MONTHLY", "2028-02-29", 31).from.toISOString()).toBe(
            "2028-01-31T03:00:00.000Z",
        )
        expect(consumption("QUARTERLY", "2026-04-30", 31).from.toISOString()).toBe(
            "2026-01-31T03:00:00.000Z",
        )
    })

    it("trimestral, semestral e anual recuam 3, 6 e 12 meses", () => {
        expect(consumption("QUARTERLY", "2026-04-05", 5).from.toISOString()).toBe(
            "2026-01-05T03:00:00.000Z",
        )
        expect(consumption("SEMIANNUAL", "2026-01-10", 10).from.toISOString()).toBe(
            "2025-07-10T03:00:00.000Z",
        )
        expect(consumption("ANNUAL", "2026-01-10", 10).from.toISOString()).toBe(
            "2025-01-10T03:00:00.000Z",
        )
    })

    it.each(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const)(
        "%s: relatórios consecutivos se encaixam, sem lacuna nem sobreposição, para qualquer dia de envio",
        (frequency) => {
            for (let sendDay = 1; sendDay <= 31; sendDay++) {
                let previousTo: Date | null = null
                let cursor = slot("2026-01-01")
                for (let n = 0; n < 24; n++) {
                    const at = computeNextRun(frequency, sendDay, cursor)
                    const input = resolveScheduledReportInput(
                        { ...TARGET, type: "CONSUMPTION", frequency, sendDay },
                        at,
                    )
                    if (input.type !== "CONSUMPTION") throw new Error("esperado consumo")

                    if (previousTo) {
                        expect(
                            input.from.toISOString(),
                            `${frequency} dia ${sendDay}, envio ${at.toISOString()}`,
                        ).toBe(previousTo.toISOString())
                    }
                    previousTo = input.to
                    cursor = at
                }
            }
        },
    )

    it("o limite de baldes diários da emissão comporta o maior período agendado", () => {
        // Um período de N dias tem até N + 1 baldes diários (o parcial de uma janela
        // que não começa à meia-noite local).
        expect(LONGEST_SCHEDULED_PERIOD_DAYS + 1).toBeLessThanOrEqual(MAX_DAILY_BUCKETS)
    })

    it("nenhum período de consumo passa do maior período agendado", () => {
        for (const frequency of ["SEMIANNUAL", "ANNUAL"] as const) {
            const input = consumption(frequency, "2029-01-31", 31)
            const days = (input.to.getTime() - input.from.getTime()) / 86_400_000
            expect(days).toBeLessThanOrEqual(LONGEST_SCHEDULED_PERIOD_DAYS)
        }
    })

    it("mensal cobre o mês-calendário anterior, inclusive na virada de ano", () => {
        const input = resolveScheduledReportInput(
            { ...TARGET, type: "MONTHLY", frequency: "MONTHLY", sendDay: 15 },
            slot("2026-01-15"),
        )
        expect(input).toMatchObject({ type: "MONTHLY", month: "2025-12" })
    })

    it("repassa alvo e formato", () => {
        const input = resolveScheduledReportInput(
            { ...TARGET, format: "CSV", type: "MONTHLY", frequency: "MONTHLY", sendDay: 2 },
            slot("2026-05-02"),
        )
        expect(input).toMatchObject({ ...TARGET, format: "CSV", month: "2026-04" })
    })

    it.each(["ALERTS", "POWER_QUALITY"] as const)(
        "%s segue o período livre desde o envio anterior",
        (type) => {
            const input = resolveScheduledReportInput(
                { ...TARGET, type, frequency: "WEEKLY", sendDay: 2 },
                slot("2026-03-10"),
            )
            expect(input).toMatchObject({ type })
            if (!("from" in input)) throw new Error("esperado período livre")
            expect(input.from.toISOString()).toBe("2026-03-03T03:00:00.000Z")
            expect(input.to.toISOString()).toBe("2026-03-10T03:00:00.000Z")
        },
    )

    it("a demanda cobre o mês-calendário anterior, como o mensal", () => {
        const input = resolveScheduledReportInput(
            { ...TARGET, type: "DEMAND", frequency: "MONTHLY", sendDay: 5 },
            slot("2026-03-05"),
        )
        expect(input).toMatchObject({ type: "DEMAND", month: "2026-02" })
    })
})
