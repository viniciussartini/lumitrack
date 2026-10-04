import { describe, it, expect } from "vitest"
import { computeGoalProgress } from "@/modules/goal/goal-progress.js"

const twelve = <T>(fill: (month: number) => T): T[] => Array.from({ length: 12 }, (_, i) => fill(i))
const target = (kwh = 400) => twelve(() => kwh)

// 15/06/2026 12:00 em São Paulo: junho tem 30 dias, então o mês está na metade.
const MID_JUNE_2026 = new Date("2026-06-15T15:00:00.000Z")

const input = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) => ({
    year: 2026,
    monthlyKwh: target(),
    realizedByMonth: twelve<number | null>(() => null),
    now: MID_JUNE_2026,
    ...override,
})

const realized = (...values: (number | null)[]): (number | null)[] =>
    twelve((i) => values[i] ?? null)

describe("computeGoalProgress — ano corrente", () => {
    it("compara o realizado com a meta acumulada, com o mês corrente proporcional aos dias", () => {
        // jan–mai completos (5 × 400) + metade de junho (200) = 2.200 de meta.
        const result = computeGoalProgress(
            input({ realizedByMonth: realized(400, 400, 400, 400, 400, 220) }),
        )

        expect(result.comparedTargetKwh).toBeCloseTo(2200)
        expect(result.realizedKwh).toBe(2220)
        expect(result.deviationPercent).toBeCloseTo((2220 / 2200 - 1) * 100)
        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.yearTargetKwh).toBe(4800)
        expect(result.currentMonthTargetKwh).toBe(400)
    })

    it("devolve os 12 meses com a meta de cada um e o realizado só até o mês corrente", () => {
        const result = computeGoalProgress(
            input({
                monthlyKwh: twelve((i) => (i + 1) * 100),
                realizedByMonth: realized(90, 210, 310, 390, 520, 100, 999),
            }),
        )

        expect(result.months).toHaveLength(12)
        expect(result.months[0]).toEqual({ month: 1, targetKwh: 100, realizedKwh: 90 })
        expect(result.months[5]).toEqual({ month: 6, targetKwh: 600, realizedKwh: 100 })
        // Julho em diante ainda não aconteceu: ignora qualquer valor recebido.
        expect(result.months[6]).toEqual({ month: 7, targetKwh: 700, realizedKwh: null })
        expect(result.currentMonthTargetKwh).toBe(600)
    })

    it("mês anterior sem leitura fica fora dos dois lados do desvio", () => {
        // Só março e junho têm leitura: meta comparada = 400 + metade de junho (200).
        const result = computeGoalProgress(
            input({ realizedByMonth: realized(null, null, 380, null, null, 190) }),
        )

        expect(result.comparedTargetKwh).toBeCloseTo(600)
        expect(result.realizedKwh).toBe(570)
        expect(result.deviationPercent).toBeCloseTo((570 / 600 - 1) * 100)
    })

    it("mês corrente sem leitura não entra na meta comparada", () => {
        const result = computeGoalProgress(
            input({ realizedByMonth: realized(400, 400, 400, 400, 400, null) }),
        )

        expect(result.comparedTargetKwh).toBe(2000)
        expect(result.realizedKwh).toBe(2000)
        expect(result.deviationPercent).toBeCloseTo(0)
    })

    it("sem nenhuma leitura, realizado e desvio são ausência — nunca zero", () => {
        const result = computeGoalProgress(input())

        expect(result.realizedKwh).toBeNull()
        expect(result.comparedTargetKwh).toBeNull()
        expect(result.deviationPercent).toBeNull()
        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.months.every((m) => m.realizedKwh === null)).toBe(true)
    })

    it("mês com leitura zerada é medição, não ausência", () => {
        const result = computeGoalProgress(input({ realizedByMonth: realized(0) }))

        expect(result.months[0]?.realizedKwh).toBe(0)
        expect(result.realizedKwh).toBe(0)
        expect(result.deviationPercent).toBeCloseTo(-100)
    })

    it("meta zerada nos meses comparados não divide por zero", () => {
        const result = computeGoalProgress(
            input({ monthlyKwh: target(0), realizedByMonth: realized(50) }),
        )

        expect(result.comparedTargetKwh).toBe(0)
        expect(result.realizedKwh).toBe(50)
        expect(result.deviationPercent).toBeNull()
    })

    it("o dia 31 e o fim de fevereiro usam os dias do próprio mês", () => {
        const endOfJanuary = new Date("2026-01-31T15:00:00.000Z")
        const january = computeGoalProgress(
            input({ now: endOfJanuary, realizedByMonth: realized(400) }),
        )
        expect(january.comparedTargetKwh).toBeCloseTo(400)

        const midFebruary = new Date("2026-02-14T15:00:00.000Z")
        const february = computeGoalProgress(
            input({ now: midFebruary, realizedByMonth: realized(null, 100) }),
        )
        // 14 de 28 dias de fevereiro.
        expect(february.comparedTargetKwh).toBeCloseTo(200)
    })

    it("a virada do ano é em São Paulo: 01:00 UTC de 1º de janeiro ainda é dezembro", () => {
        const stillLastYear = new Date("2027-01-01T01:00:00.000Z")

        const lastYear = computeGoalProgress(input({ year: 2026, now: stillLastYear }))
        expect(lastYear.situation).toBe("IN_PROGRESS")
        expect(lastYear.currentMonthTargetKwh).toBe(400)

        const nextYear = computeGoalProgress(input({ year: 2027, now: stillLastYear }))
        expect(nextYear.situation).toBe("IN_PROGRESS")
        expect(nextYear.currentMonthTargetKwh).toBeNull()
    })
})

describe("computeGoalProgress — ano passado", () => {
    const past = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) =>
        input({ year: 2025, ...override })

    it("cumprida quando o realizado não passa da meta", () => {
        const result = computeGoalProgress(past({ realizedByMonth: twelve(() => 390) }))

        expect(result.situation).toBe("MET")
        expect(result.realizedKwh).toBe(4680)
        expect(result.comparedTargetKwh).toBe(4800)
        expect(result.deviationPercent).toBeCloseTo((4680 / 4800 - 1) * 100)
        expect(result.currentMonthTargetKwh).toBeNull()
    })

    it("igual à meta é cumprida", () => {
        const result = computeGoalProgress(past({ realizedByMonth: twelve(() => 400) }))
        expect(result.situation).toBe("MET")
    })

    it("não cumprida quando passa da meta", () => {
        const result = computeGoalProgress(past({ realizedByMonth: twelve(() => 410) }))

        expect(result.situation).toBe("NOT_MET")
        expect(result.deviationPercent).toBeCloseTo(2.5)
    })

    it("sem nenhuma leitura no ano, a situação é desconhecida", () => {
        const result = computeGoalProgress(past())

        expect(result.situation).toBeNull()
        expect(result.realizedKwh).toBeNull()
        expect(result.deviationPercent).toBeNull()
    })

    it("o veredito usa só os meses com leitura, na mesma base do desvio", () => {
        // Só jan–mar têm leitura (1.200 contra 1.200 de meta): cumprida.
        const result = computeGoalProgress(past({ realizedByMonth: realized(400, 400, 400) }))

        expect(result.situation).toBe("MET")
        expect(result.comparedTargetKwh).toBe(1200)
    })

    it("meta zerada com consumo registrado não é cumprida", () => {
        const result = computeGoalProgress(
            past({ monthlyKwh: target(0), realizedByMonth: realized(10) }),
        )

        expect(result.situation).toBe("NOT_MET")
        expect(result.deviationPercent).toBeNull()
    })
})

describe("computeGoalProgress — ano futuro", () => {
    it("está em andamento, sem realizado nem desvio", () => {
        const result = computeGoalProgress(
            input({ year: 2027, realizedByMonth: twelve(() => 500) }),
        )

        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.realizedKwh).toBeNull()
        expect(result.deviationPercent).toBeNull()
        expect(result.currentMonthTargetKwh).toBeNull()
        expect(result.months.every((m) => m.realizedKwh === null)).toBe(true)
        expect(result.yearTargetKwh).toBe(4800)
    })
})
