import { describe, it, expect } from "vitest"
import { resolveConsumptionWindow } from "@/lib/consumptionWindow"

// 21/08/2026 às 19:45 — o mesmo instante do relato da issue #226.
const NOW = new Date(2026, 7, 21, 19, 45, 30)

describe("resolveConsumptionWindow", () => {
    it("hora → buckets de minuto, da hora cheia até a hora seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("hour", NOW)

        expect(bucketSize).toBe("minute")
        expect(from).toEqual(new Date(2026, 7, 21, 19, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 21, 20, 0, 0, 0))
    })

    it("dia → buckets de hora, da meia-noite ao início do dia seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("day", NOW)

        expect(bucketSize).toBe("hour")
        expect(from).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 22, 0, 0, 0, 0))
    })

    it("mês → buckets de dia, do dia 1 ao início do mês seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("month", NOW)

        expect(bucketSize).toBe("day")
        expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
    })

    it("ano → buckets de mês, de 1º de janeiro ao início do ano seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("year", NOW)

        expect(bucketSize).toBe("month")
        expect(from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
    })

    it("vira o dia quando a janela de hora começa às 23h", () => {
        const { from, to } = resolveConsumptionWindow("hour", new Date(2026, 7, 21, 23, 10))

        expect(from).toEqual(new Date(2026, 7, 21, 23, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 22, 0, 0, 0, 0))
    })

    it("vira o ano quando a janela de mês é dezembro", () => {
        const { from, to } = resolveConsumptionWindow("month", new Date(2026, 11, 31, 23, 59))

        expect(from).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
    })
})
