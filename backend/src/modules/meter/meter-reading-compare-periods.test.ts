import { describe, it, expect } from "vitest"
import {
    computeComparePeriodsWindow,
    computePeriodDiff,
    deriveComparePeriodsGranularity,
} from "@/modules/meter/meter-reading-compare-periods.js"

describe("deriveComparePeriodsGranularity", () => {
    it("duração <= 1 dia vira balde por hora", () => {
        expect(deriveComparePeriodsGranularity(60 * 60_000)).toBe("hour")
        expect(deriveComparePeriodsGranularity(24 * 60 * 60_000)).toBe("hour")
    })

    it("duração > 1 dia vira balde por dia", () => {
        expect(deriveComparePeriodsGranularity(24 * 60 * 60_000 + 1)).toBe("day")
        expect(deriveComparePeriodsGranularity(7 * 24 * 60 * 60_000)).toBe("day")
    })
})

describe("computeComparePeriodsWindow", () => {
    it("período de 3h (granularidade hora): 3 baldes, cada um começando no início do PRÓPRIO período", () => {
        const periodA = {
            from: new Date("2026-01-15T14:00:00.000Z"),
            to: new Date("2026-01-15T17:00:00.000Z"),
        }
        const periodB = {
            from: new Date("2026-02-20T09:30:00.000Z"),
            to: new Date("2026-02-20T12:30:00.000Z"),
        }

        const result = computeComparePeriodsWindow(periodA, periodB)

        expect(result.granularity).toBe("hour")
        expect(result.periodA.bucketStarts).toEqual([
            new Date("2026-01-15T14:00:00.000Z"),
            new Date("2026-01-15T15:00:00.000Z"),
            new Date("2026-01-15T16:00:00.000Z"),
        ])
        // B começa numa hora-relógio diferente (09:30, não em hora cheia) —
        // os baldes de B também partem do início de B, não de uma fronteira
        // de calendário.
        expect(result.periodB.bucketStarts).toEqual([
            new Date("2026-02-20T09:30:00.000Z"),
            new Date("2026-02-20T10:30:00.000Z"),
            new Date("2026-02-20T11:30:00.000Z"),
        ])
    })

    it("mesma duração, calendários diferentes (A alinhado à meia-noite, B não): mesma contagem de baldes nos dois", () => {
        const periodA = {
            from: new Date("2026-01-01T00:00:00.000Z"),
            to: new Date("2026-01-04T00:00:00.000Z"), // 3 dias exatos
        }
        const periodB = {
            from: new Date("2026-03-10T13:00:00.000Z"),
            to: new Date("2026-03-13T13:00:00.000Z"), // 3 dias exatos, começando às 13h
        }

        const result = computeComparePeriodsWindow(periodA, periodB)

        expect(result.granularity).toBe("day")
        expect(result.periodA.bucketStarts).toHaveLength(3)
        expect(result.periodB.bucketStarts).toHaveLength(3)
        expect(result.periodB.bucketStarts[0]).toEqual(new Date("2026-03-10T13:00:00.000Z"))
    })

    it("duração não múltipla exata do balde: último balde é parcial, mas ainda aparece (contagem arredondada para cima)", () => {
        const periodA = {
            from: new Date("2026-01-15T00:00:00.000Z"),
            to: new Date("2026-01-16T12:00:00.000Z"), // 1,5 dia
        }
        const periodB = {
            from: new Date("2026-05-01T00:00:00.000Z"),
            to: new Date("2026-05-02T12:00:00.000Z"),
        }

        const result = computeComparePeriodsWindow(periodA, periodB)

        expect(result.granularity).toBe("day")
        expect(result.periodA.bucketStarts).toHaveLength(2)
        expect(result.periodA.bucketStarts[1]).toEqual(new Date("2026-01-16T00:00:00.000Z"))
    })
})

describe("computePeriodDiff", () => {
    it("diferença absoluta e percentual de B sobre A", () => {
        const result = computePeriodDiff(
            { min: 200, avg: 220, max: 240 },
            { min: 210, avg: 231, max: 250 },
        )

        expect(result.absolute).toBeCloseTo(11)
        expect(result.percent).toBeCloseTo(5) // 11/220 * 100
    })

    it("diferença negativa (B menor que A)", () => {
        const result = computePeriodDiff({ min: 0, avg: 100, max: 0 }, { min: 0, avg: 80, max: 0 })

        expect(result.absolute).toBeCloseTo(-20)
        expect(result.percent).toBeCloseTo(-20)
    })

    it("média de A nula (grandeza nunca reportada no período): diferença toda null, nunca 0 (RN34)", () => {
        const result = computePeriodDiff(
            { min: null, avg: null, max: null },
            { min: 10, avg: 20, max: 30 },
        )

        expect(result.absolute).toBeNull()
        expect(result.percent).toBeNull()
    })

    it("média de A é zero: percentual null (não Infinity/NaN), absoluta ainda calculada", () => {
        const result = computePeriodDiff({ min: 0, avg: 0, max: 0 }, { min: 5, avg: 10, max: 15 })

        expect(result.absolute).toBeCloseTo(10)
        expect(result.percent).toBeNull()
    })
})
