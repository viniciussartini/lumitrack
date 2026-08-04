import { describe, it, expect } from "vitest"
import {
    toLocalDateKey,
    findBucketForDate,
    computeTodayDelta,
    daysInMonth,
    computeMonthProjection,
} from "@/lib/dashboardKpis"
import type { ConsumptionBucket } from "@/types/consumption.types"

const bucket = (bucketStart: string, kwhConsumed: number): ConsumptionBucket => ({
    bucketStart,
    kwhConsumed,
    costBrl: kwhConsumed * 0.8,
    avgPowerW: 500,
})

describe("toLocalDateKey", () => {
    it("formata a data local como YYYY-MM-DD", () => {
        const date = new Date(2026, 7, 3) // 3 de agosto de 2026 (mês 0-indexed)
        expect(toLocalDateKey(date)).toBe("2026-08-03")
    })

    it("preenche mês/dia com zero à esquerda", () => {
        const date = new Date(2026, 0, 5) // 5 de janeiro
        expect(toLocalDateKey(date)).toBe("2026-01-05")
    })
})

describe("findBucketForDate", () => {
    it("acha o bucket pela data, não pela posição", () => {
        const items = [
            bucket("2026-08-01T12:00:00.000Z", 5), // mais recente, mas NÃO é hoje
            bucket("2026-07-31T12:00:00.000Z", 3),
        ]
        const today = new Date(2026, 7, 3) // hoje é dia 3 — nenhum bucket bate
        expect(findBucketForDate(items, today)).toBeUndefined()

        const yesterday = new Date(2026, 6, 31)
        expect(findBucketForDate(items, yesterday)?.kwhConsumed).toBe(3)
    })

    it("retorna undefined para lista vazia", () => {
        expect(findBucketForDate([], new Date())).toBeUndefined()
    })
})

describe("computeTodayDelta", () => {
    it("calcula a variação percentual normal", () => {
        expect(computeTodayDelta(12, 10)).toBeCloseTo(0.2)
        expect(computeTodayDelta(8, 10)).toBeCloseTo(-0.2)
    })

    it("retorna null quando ontem foi zero (não dá pra calcular)", () => {
        expect(computeTodayDelta(5, 0)).toBeNull()
    })
})

describe("daysInMonth", () => {
    it("calcula os dias de um mês de 31", () => {
        expect(daysInMonth(new Date(2026, 7, 15))).toBe(31) // agosto
    })

    it("calcula fevereiro de ano bissexto e não-bissexto", () => {
        expect(daysInMonth(new Date(2024, 1, 10))).toBe(29) // 2024 bissexto
        expect(daysInMonth(new Date(2026, 1, 10))).toBe(28)
    })
})

describe("computeMonthProjection", () => {
    it("projeta linearmente pelo restante do mês", () => {
        // R$100 acumulados em 10 dias, mês de 30 dias → projeta R$300
        expect(computeMonthProjection(100, 10, 30)).toBeCloseTo(300)
    })

    it("retorna o custo acumulado sem dividir quando dayOfMonth <= 0", () => {
        expect(computeMonthProjection(50, 0, 30)).toBe(50)
    })
})
