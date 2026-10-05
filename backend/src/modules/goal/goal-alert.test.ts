import { describe, it, expect } from "vitest"
import type { GoalUnit } from "@/generated/prisma/client.js"
import { computeGoalAlertState } from "@/modules/goal/goal-alert.js"
import { computeGoalProgress } from "@/modules/goal/goal-progress.js"

const twelve = <T>(fill: (month: number) => T): T[] => Array.from({ length: 12 }, (_, i) => fill(i))

// 15/06/2026 12:00 em São Paulo.
const MID_JUNE_2026 = new Date("2026-06-15T15:00:00.000Z")

const stateFor = (
    realized: (number | null)[],
    options: {
        year?: number
        monthlyTargets?: number[]
        alertPercent?: number
        unit?: GoalUnit
    } = {},
) => {
    const progress = computeGoalProgress({
        unit: options.unit ?? "KWH",
        year: options.year ?? 2026,
        monthlyTargets: options.monthlyTargets ?? twelve(() => 400),
        realizedByMonth: twelve((i) => realized[i] ?? null),
        now: MID_JUNE_2026,
    })
    return computeGoalAlertState(
        progress,
        options.alertPercent ?? 85,
        MID_JUNE_2026,
        options.unit ?? "KWH",
    )
}

describe("computeGoalAlertState — mês", () => {
    it("percentual do mês corrente contra a meta do mês", () => {
        const state = stateFor([null, null, null, null, null, 300])

        expect(state.month.percent).toBeCloseTo(75)
        expect(state.month.reached).toBe(false)
    })

    it("no limite exato do percentual já é atingido", () => {
        const state = stateFor([null, null, null, null, null, 340])

        expect(state.month.percent).toBeCloseTo(85)
        expect(state.month.reached).toBe(true)
    })

    it("acima da meta do mês é atingido", () => {
        const state = stateFor([null, null, null, null, null, 520], { alertPercent: 100 })

        expect(state.month.percent).toBeCloseTo(130)
        expect(state.month.reached).toBe(true)
    })

    it("mês corrente sem leitura não tem percentual nem dispara", () => {
        const state = stateFor([400, 400, 400, 400, 400, null])

        expect(state.month).toEqual({ percent: null, reached: false })
    })

    it("meta do mês zerada não tem percentual (sem divisão por zero)", () => {
        const monthlyTargets = twelve((i) => (i === 5 ? 0 : 400))
        const state = stateFor([null, null, null, null, null, 50], { monthlyTargets })

        expect(state.month).toEqual({ percent: null, reached: false })
    })

    it("mês com leitura zerada é medição: 0% e não atingido", () => {
        const state = stateFor([null, null, null, null, null, 0])

        expect(state.month.percent).toBe(0)
        expect(state.month.reached).toBe(false)
    })
})

describe("computeGoalAlertState — ano", () => {
    it("percentual do acumulado do ano contra a meta anual inteira", () => {
        // 2.040 de 4.800 = 42,5%.
        const state = stateFor([340, 340, 340, 340, 340, 340])

        expect(state.year.percent).toBeCloseTo(42.5)
        expect(state.year.reached).toBe(false)
    })

    it("atinge o percentual do ano mesmo com o mês corrente ainda dentro da meta", () => {
        // 4.200 de 4.800 = 87,5%, com junho em 250 (62,5% do mês).
        const state = stateFor([800, 800, 800, 800, 750, 250])

        expect(state.year.percent).toBeCloseTo(87.5)
        expect(state.year.reached).toBe(true)
        expect(state.month.reached).toBe(false)
    })

    it("mês e ano são independentes", () => {
        const state = stateFor([100, 100, 100, 100, 100, 400])

        expect(state.month.reached).toBe(true)
        expect(state.year.reached).toBe(false)
    })

    it("sem leitura nenhuma no ano, não há percentual", () => {
        const state = stateFor([])

        expect(state.year).toEqual({ percent: null, reached: false })
    })

    it("meta anual zerada não tem percentual", () => {
        const state = stateFor([10], { monthlyTargets: twelve(() => 0) })

        expect(state.year).toEqual({ percent: null, reached: false })
    })

    it("meses sem leitura no meio não impedem o acumulado do que houve", () => {
        const state = stateFor([2400, null, null, null, null, null])

        expect(state.year.percent).toBeCloseTo(50)
    })
})

describe("computeGoalAlertState — outros anos", () => {
    it("meta de ano futuro nunca dispara", () => {
        const state = stateFor(
            twelve(() => 9999),
            { year: 2027 },
        )

        expect(state.month).toEqual({ percent: null, reached: false })
        expect(state.year).toEqual({ percent: null, reached: false })
    })

    it("meta de ano passado nunca dispara", () => {
        const state = stateFor(
            twelve(() => 9999),
            { year: 2025 },
        )

        expect(state.month).toEqual({ percent: null, reached: false })
        expect(state.year).toEqual({ percent: null, reached: false })
    })
})

describe("computeGoalAlertState — demanda em kW", () => {
    it("o mês compara o pico do mês com o teto do mês", () => {
        const state = stateFor([null, null, null, null, null, 162], {
            unit: "KW",
            monthlyTargets: twelve(() => 180),
        })

        expect(state.month.percent).toBeCloseTo(90)
        expect(state.month.reached).toBe(true)
    })

    it("pico abaixo do percentual não dispara", () => {
        const state = stateFor([null, null, null, null, null, 100], {
            unit: "KW",
            monthlyTargets: twelve(() => 180),
        })

        expect(state.month.reached).toBe(false)
    })

    it("não há aviso anual: pico não acumula, mesmo com picos altos o ano todo", () => {
        const state = stateFor(
            twelve(() => 500),
            { unit: "KW", monthlyTargets: twelve(() => 180) },
        )

        expect(state.year).toEqual({ percent: null, reached: false })
    })

    it("mês sem janela medida não tem percentual", () => {
        const state = stateFor([180], { unit: "KW", monthlyTargets: twelve(() => 180) })

        expect(state.month).toEqual({ percent: null, reached: false })
    })
})
