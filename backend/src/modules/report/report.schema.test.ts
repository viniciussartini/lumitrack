import { describe, it, expect } from "vitest"
import {
    createReportSchema,
    monthToPeriod,
    resolveReportPeriod,
} from "@/modules/report/report.schema.js"

const targetId = "3f2b8c1e-9d4a-4c6e-8f21-0a1b2c3d4e5f"

describe("createReportSchema", () => {
    it("aceita relatório de consumo com período livre", () => {
        const result = createReportSchema.safeParse({
            type: "CONSUMPTION",
            targetType: "PROPERTY",
            targetId,
            format: "PDF",
            from: "2026-07-01T03:00:00.000Z",
            to: "2026-07-08T03:00:00.000Z",
        })
        expect(result.success).toBe(true)
    })

    it("rejeita período invertido ou vazio", () => {
        const result = createReportSchema.safeParse({
            type: "CONSUMPTION",
            targetType: "PROPERTY",
            targetId,
            format: "CSV",
            from: "2026-07-08T03:00:00.000Z",
            to: "2026-07-08T03:00:00.000Z",
        })
        expect(result.success).toBe(false)
    })

    it("aceita exatamente 92 dias e rejeita 93", () => {
        const base = { type: "CONSUMPTION", targetType: "AREA", targetId, format: "CSV" }
        const from = new Date("2026-01-01T03:00:00.000Z")
        const at = (days: number) => new Date(from.getTime() + days * 24 * 60 * 60 * 1000)

        expect(createReportSchema.safeParse({ ...base, from, to: at(92) }).success).toBe(true)
        expect(createReportSchema.safeParse({ ...base, from, to: at(93) }).success).toBe(false)
    })

    it("aceita relatório mensal só com o mês", () => {
        const result = createReportSchema.safeParse({
            type: "MONTHLY",
            targetType: "DEVICE",
            targetId,
            format: "PDF",
            month: "2026-07",
        })
        expect(result.success).toBe(true)
    })

    it.each(["2026-13", "2026-00", "2026-7", "07/2026", "2026-07-01"])(
        "rejeita mês malformado: %s",
        (month) => {
            const result = createReportSchema.safeParse({
                type: "MONTHLY",
                targetType: "PROPERTY",
                targetId,
                format: "PDF",
                month,
            })
            expect(result.success).toBe(false)
        },
    )

    it("rejeita tipo desconhecido", () => {
        const result = createReportSchema.safeParse({
            type: "OUTRO",
            targetType: "PROPERTY",
            targetId,
            format: "PDF",
            month: "2026-07",
        })
        expect(result.success).toBe(false)
    })

    it.each(["ALERTS", "POWER_QUALITY"])("%s usa período livre, como o consumo", (type) => {
        const base = { type, targetType: "PROPERTY", targetId, format: "CSV" }

        expect(
            createReportSchema.safeParse({
                ...base,
                from: "2026-07-01T03:00:00.000Z",
                to: "2026-08-01T03:00:00.000Z",
            }).success,
        ).toBe(true)
        expect(createReportSchema.safeParse({ ...base, month: "2026-07" }).success).toBe(false)
        expect(
            createReportSchema.safeParse({
                ...base,
                from: "2026-01-01T03:00:00.000Z",
                to: "2026-06-01T03:00:00.000Z",
            }).success,
        ).toBe(false)
    })

    it("DEMAND usa o mês, e resolve o mesmo intervalo do mensal", () => {
        const base = { type: "DEMAND", targetType: "PROPERTY", targetId, format: "PDF" }

        const parsed = createReportSchema.safeParse({ ...base, month: "2026-07" })

        expect(parsed.success).toBe(true)
        expect(
            createReportSchema.safeParse({
                ...base,
                from: "2026-07-01T03:00:00.000Z",
                to: "2026-08-01T03:00:00.000Z",
            }).success,
        ).toBe(false)
        if (parsed.success) {
            expect(resolveReportPeriod(parsed.data)).toEqual({
                from: new Date("2026-07-01T03:00:00.000Z"),
                to: new Date("2026-08-01T03:00:00.000Z"),
            })
        }
    })

    it("rejeita formato desconhecido e alvo inválido", () => {
        expect(
            createReportSchema.safeParse({
                type: "MONTHLY",
                targetType: "PROPERTY",
                targetId,
                format: "XLSX",
                month: "2026-07",
            }).success,
        ).toBe(false)
        expect(
            createReportSchema.safeParse({
                type: "MONTHLY",
                targetType: "PROPERTY",
                targetId: "nao-e-uuid",
                format: "PDF",
                month: "2026-07",
            }).success,
        ).toBe(false)
    })
})

describe("monthToPeriod", () => {
    it("vai da meia-noite de São Paulo do dia 1º à do mês seguinte", () => {
        const { from, to } = monthToPeriod("2026-07")
        expect(from.toISOString()).toBe("2026-07-01T03:00:00.000Z")
        expect(to.toISOString()).toBe("2026-08-01T03:00:00.000Z")
    })

    it("vira o ano em dezembro", () => {
        const { from, to } = monthToPeriod("2026-12")
        expect(from.toISOString()).toBe("2026-12-01T03:00:00.000Z")
        expect(to.toISOString()).toBe("2027-01-01T03:00:00.000Z")
    })

    it("cobre fevereiro de ano bissexto com 29 dias", () => {
        const { from, to } = monthToPeriod("2028-02")
        expect((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)).toBe(29)
    })
})

describe("resolveReportPeriod", () => {
    it("usa from/to no consumo e o mês inteiro no mensal", () => {
        const consumption = createReportSchema.parse({
            type: "CONSUMPTION",
            targetType: "PROPERTY",
            targetId,
            format: "PDF",
            from: "2026-07-01T03:00:00.000Z",
            to: "2026-07-05T03:00:00.000Z",
        })
        expect(resolveReportPeriod(consumption).to.toISOString()).toBe("2026-07-05T03:00:00.000Z")

        const monthly = createReportSchema.parse({
            type: "MONTHLY",
            targetType: "PROPERTY",
            targetId,
            format: "PDF",
            month: "2026-07",
        })
        expect(resolveReportPeriod(monthly).to.toISOString()).toBe("2026-08-01T03:00:00.000Z")
    })
})
