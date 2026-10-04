import { describe, it, expect } from "vitest"
import {
    applySpecificKwh,
    buildGoalCreateInput,
    buildGoalUpdateInput,
    currentGoalMonthIndex,
    currentGoalYear,
    describeCurrentGoal,
    describeGoalSituation,
    goalToFormState,
    goalYearlyKwh,
    initialGoalForm,
    isGoalLocked,
    validateGoalForm,
    type GoalFormState,
} from "@/lib/goals"
import type { Goal } from "@/types/goal.types"

const goal = (override: Partial<Goal> = {}): Goal => ({
    id: "g1",
    propertyId: "p1",
    year: 2026,
    referenceYear: 2025,
    monthlyKwh: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...override,
})

const filled = (override: Partial<GoalFormState> = {}): GoalFormState => ({
    ...goalToFormState(goal()),
    ...override,
})

describe("ano e mês corrente em São Paulo", () => {
    it("1º de janeiro às 01:00 UTC ainda é dezembro do ano anterior", () => {
        const now = new Date("2027-01-01T01:00:00.000Z")
        expect(currentGoalYear(now)).toBe(2026)
        expect(currentGoalMonthIndex(now)).toBe(11)
    })

    it("a virada acontece às 03:00 UTC", () => {
        const now = new Date("2027-01-01T03:00:00.000Z")
        expect(currentGoalYear(now)).toBe(2027)
        expect(currentGoalMonthIndex(now)).toBe(0)
    })
})

describe("regras da meta", () => {
    it("só ano passado é imutável", () => {
        expect(isGoalLocked(goal({ year: 2025 }), 2026)).toBe(true)
        expect(isGoalLocked(goal({ year: 2026 }), 2026)).toBe(false)
        expect(isGoalLocked(goal({ year: 2027 }), 2026)).toBe(false)
    })

    it("a meta do ano é a soma dos 12 meses", () => {
        expect(goalYearlyKwh(goal())).toBe(4800)
        expect(
            goalYearlyKwh(goal({ monthlyKwh: [100, ...Array.from({ length: 11 }, () => 0)] })),
        ).toBe(100)
    })

    it("situação: em andamento até o ano acabar; depois, ausência até haver realizado", () => {
        expect(describeGoalSituation(goal({ year: 2026 }), 2026)).toBe("Em andamento")
        expect(describeGoalSituation(goal({ year: 2027 }), 2026)).toBe("Em andamento")
        expect(describeGoalSituation(goal({ year: 2025 }), 2026)).toBe("-")
    })

    it("descreve a meta vigente com a meta do mês corrente", () => {
        const months = Array.from({ length: 12 }, (_, i) => (i + 1) * 100)
        const text = describeCurrentGoal(goal({ monthlyKwh: months }), 2)

        expect(text).toContain("Teto de 7.800 kWh para 2026")
        expect(text).toContain("referência 2025")
        expect(text).toContain("meta do mês 300 kWh")
        expect(text).toContain("alerta ao atingir 85%")
    })
})

describe("initialGoalForm", () => {
    it("sugere o ano corrente e o último ano completo como referência", () => {
        const state = initialGoalForm(2026, [])
        expect(state).toMatchObject({ year: "2026", referenceYear: "2025", alertPercent: "85" })
        expect(state.months).toHaveLength(12)
    })

    it("pula os anos que já têm meta", () => {
        expect(initialGoalForm(2026, [2026, 2027]).year).toBe("2028")
    })
})

describe("applySpecificKwh", () => {
    it("repete o valor nos 12 meses e mantém o resto do rascunho", () => {
        const next = applySpecificKwh(filled({ alertPercent: "90" }), "650")
        expect(next.months).toEqual(Array.from({ length: 12 }, () => "650"))
        expect(next.specificKwh).toBe("650")
        expect(next.alertPercent).toBe("90")
    })
})

describe("goalToFormState", () => {
    it("o atalho mostra a média mensal", () => {
        expect(goalToFormState(goal()).specificKwh).toBe("400")
    })
})

describe("validateGoalForm", () => {
    it("aceita um rascunho completo", () => {
        expect(validateGoalForm(filled())).toBeNull()
    })

    it("rejeita ano fora de 2020–2100", () => {
        expect(validateGoalForm(filled({ year: "2101" }))).toMatch(/ano da meta/i)
        expect(validateGoalForm(filled({ year: "" }))).toMatch(/ano da meta/i)
    })

    it("rejeita ano que a propriedade já tem", () => {
        expect(validateGoalForm(filled({ year: "2026" }), [2026])).toMatch(/já tem uma meta/i)
        expect(validateGoalForm(filled({ year: "2026" }), [2025])).toBeNull()
    })

    it("a referência é anterior ao ano da meta", () => {
        expect(validateGoalForm(filled({ referenceYear: "2026" }))).toMatch(/anterior/i)
        expect(validateGoalForm(filled({ referenceYear: "2019" }))).toMatch(/referência/i)
    })

    it("o percentual de alerta vai de 10 a 100", () => {
        expect(validateGoalForm(filled({ alertPercent: "9" }))).toMatch(/10 a 100/)
        expect(validateGoalForm(filled({ alertPercent: "101" }))).toMatch(/10 a 100/)
        expect(validateGoalForm(filled({ alertPercent: "85.5" }))).toMatch(/10 a 100/)
    })

    it("exige os 12 meses, sem negativos", () => {
        const withBlank = filled({ months: ["", ...Array.from({ length: 11 }, () => "400")] })
        const withNegative = filled({ months: ["-1", ...Array.from({ length: 11 }, () => "400")] })
        expect(validateGoalForm(withBlank)).toMatch(/12 meses/)
        expect(validateGoalForm(withNegative)).toMatch(/12 meses/)
    })

    it("aceita mês zerado", () => {
        const withZero = filled({ months: ["0", ...Array.from({ length: 11 }, () => "400")] })
        expect(validateGoalForm(withZero)).toBeNull()
    })
})

describe("montagem do corpo", () => {
    it("a criação leva propriedade, ano e valores, sem o atalho de preenchimento", () => {
        const input = buildGoalCreateInput(filled({ specificKwh: "999" }), "p1")
        expect(input).toEqual({
            propertyId: "p1",
            year: 2026,
            referenceYear: 2025,
            monthlyKwh: Array.from({ length: 12 }, () => 400),
            alertPercent: 85,
        })
    })

    it("a edição leva só os valores editáveis", () => {
        const input = buildGoalUpdateInput(filled({ alertPercent: "90" }))
        expect(input).toEqual({
            referenceYear: 2025,
            monthlyKwh: Array.from({ length: 12 }, () => 400),
            alertPercent: 90,
        })
        expect(input).not.toHaveProperty("year")
        expect(input).not.toHaveProperty("propertyId")
    })
})
