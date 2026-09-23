import { describe, it, expect } from "vitest"
import { resolveMonthFigures, resolveTodayKwh } from "@/lib/targetKpis"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

const item = (
    bucketStart: string,
    kwhConsumed: number,
    costBrl?: number,
): ConsumptionSummaryItem => ({
    id: "area-1",
    targetType: "AREA",
    bucketStart,
    kwhConsumed,
    avgPowerW: 300,
    ...(costBrl !== undefined && { costBrl }),
})

// O backend grava o bucket em horário de parede de SP e o serializa com sufixo Z.
const NOW = new Date(2026, 8, 21, 15, 30)

describe("resolveTodayKwh", () => {
    it("sem item (sem leitura ainda), não há dado", () => {
        expect(resolveTodayKwh(undefined, NOW)).toBeNull()
    })

    it("o bucket de hoje é o consumo de hoje", () => {
        expect(resolveTodayKwh(item("2026-09-21T00:00:00.000Z", 12.5), NOW)).toBe(12.5)
    })

    it("o bucket mais recente ser de outro dia significa que hoje ainda não consumiu", () => {
        expect(resolveTodayKwh(item("2026-09-20T00:00:00.000Z", 40), NOW)).toBe(0)
    })
})

describe("resolveMonthFigures", () => {
    it("sem item, não há dado", () => {
        expect(resolveMonthFigures(undefined, NOW)).toBeNull()
    })

    it("mês corrente: consumo e custo do bucket", () => {
        expect(resolveMonthFigures(item("2026-09-01T00:00:00.000Z", 200, 160), NOW)).toEqual({
            kwh: 200,
            costBrl: 160,
        })
    })

    it("último bucket de mês anterior: o mês corrente está zerado", () => {
        expect(resolveMonthFigures(item("2026-08-01T00:00:00.000Z", 200, 160), NOW)).toEqual({
            kwh: 0,
            costBrl: 0,
        })
    })

    it("custo não calculável (Grupo A ou Branca) fica ausente, nunca zero", () => {
        expect(resolveMonthFigures(item("2026-09-01T00:00:00.000Z", 200), NOW)).toEqual({
            kwh: 200,
            costBrl: null,
        })
        expect(resolveMonthFigures(item("2026-08-01T00:00:00.000Z", 200), NOW)).toEqual({
            kwh: 0,
            costBrl: null,
        })
    })
})
