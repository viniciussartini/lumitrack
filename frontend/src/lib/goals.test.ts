import { describe, it, expect } from "vitest"
import {
    applySpecificValue,
    buildGoalCreateInput,
    buildGoalUpdateInput,
    currentGoalMonthIndex,
    currentGoalYear,
    describeCurrentGoal,
    availableGoalUnits,
    formatGoalValue,
    goalUnitLabels,
    describeSituation,
    deviationTone,
    formatDeviation,
    formatGoalPercent,
    formatRealized,
    goalToFormState,
    goalYearlyTotal,
    initialGoalForm,
    isGoalLocked,
    referenceGoalForm,
    validateGoalForm,
    type GoalFormState,
} from "@/lib/goals"
import type { Goal, GoalProgress } from "@/types/goal.types"

const goal = (override: Partial<Goal> = {}): Goal => ({
    id: "g1",
    propertyId: "p1",
    year: 2026,
    unit: "KWH",
    referenceYear: 2025,
    monthlyTargets: Array.from({ length: 12 }, () => 400),
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
        expect(goalYearlyTotal(goal())).toBe(4800)
        expect(
            goalYearlyTotal(
                goal({ monthlyTargets: [100, ...Array.from({ length: 11 }, () => 0)] }),
            ),
        ).toBe(100)
    })

    it("descreve a meta vigente com a meta do mês corrente", () => {
        const months = Array.from({ length: 12 }, (_, i) => (i + 1) * 100)
        const text = describeCurrentGoal(goal({ monthlyTargets: months }), 2)

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

describe("applySpecificValue", () => {
    it("repete o valor nos 12 meses e mantém o resto do rascunho", () => {
        const next = applySpecificValue(filled({ alertPercent: "90" }), "650")
        expect(next.months).toEqual(Array.from({ length: 12 }, () => "650"))
        expect(next.specificValue).toBe("650")
        expect(next.alertPercent).toBe("90")
    })
})

describe("goalToFormState", () => {
    it("o atalho mostra a média mensal", () => {
        expect(goalToFormState(goal()).specificValue).toBe("400")
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
        const input = buildGoalCreateInput(filled({ specificValue: "999" }), "p1", "KWH")
        expect(input).toEqual({
            propertyId: "p1",
            year: 2026,
            unit: "KWH",
            referenceYear: 2025,
            monthlyTargets: Array.from({ length: 12 }, () => 400),
            alertPercent: 85,
        })
    })

    it("a edição leva só os valores editáveis", () => {
        const input = buildGoalUpdateInput(filled({ alertPercent: "90" }))
        expect(input).toEqual({
            referenceYear: 2025,
            monthlyTargets: Array.from({ length: 12 }, () => 400),
            alertPercent: 90,
        })
        expect(input).not.toHaveProperty("year")
        expect(input).not.toHaveProperty("propertyId")
    })
})

describe("situação e desvio do acompanhamento", () => {
    it('rotula cada situação e trata ausência como "-"', () => {
        expect(describeSituation("IN_PROGRESS")).toEqual({ label: "Em andamento", tone: "warning" })
        expect(describeSituation("MET")).toEqual({ label: "Cumprida", tone: "success" })
        expect(describeSituation("NOT_MET")).toEqual({ label: "Não cumprida", tone: "danger" })
        expect(describeSituation(null)).toEqual({ label: "-", tone: "muted" })
        expect(describeSituation(undefined)).toEqual({ label: "-", tone: "muted" })
    })

    it("formata o desvio com sinal, vírgula decimal e uma casa", () => {
        expect(formatDeviation(2.54)).toBe("+2,5%")
        expect(formatDeviation(-3.1)).toBe("−3,1%")
        expect(formatDeviation(0)).toBe("+0,0%")
        expect(formatDeviation(null)).toBe("-")
        expect(formatDeviation(undefined)).toBe("-")
    })

    it("acima da meta é perigo; no limite ou abaixo, sucesso; sem desvio, neutro", () => {
        expect(deviationTone(0.1)).toBe("danger")
        expect(deviationTone(0)).toBe("success")
        expect(deviationTone(-5)).toBe("success")
        expect(deviationTone(null)).toBe("muted")
    })

    it('realizado ausente é "-", nunca 0 kWh', () => {
        const progress = (realized: number | null): GoalProgress => ({
            goalId: "g1",
            year: 2026,
            unit: "KWH",
            months: [],
            yearTarget: 4800,
            realized,
            deviationPercent: null,
            currentMonthTarget: null,
            situation: "IN_PROGRESS",
        })
        expect(formatRealized(progress(2220))).toBe("2.220 kWh")
        expect(formatRealized(progress(0))).toBe("0 kWh")
        expect(formatRealized(progress(null))).toBe("-")
        expect(formatRealized(undefined)).toBe("-")
    })
})

describe("referenceGoalForm", () => {
    const progressWith = (realized: (number | null)[]): GoalProgress => ({
        goalId: "g1",
        year: 2025,
        unit: "KWH",
        months: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            target: 400,
            realized: realized[i] ?? null,
        })),
        yearTarget: 4800,
        realized: null,
        deviationPercent: null,
        currentMonthTarget: null,
        situation: "MET",
    })

    it("propõe o ano seguinte ao corrente, com o ano escolhido como referência", () => {
        const state = referenceGoalForm(goal({ year: 2025 }), progressWith([]), 2026, [])

        expect(state.year).toBe("2027")
        expect(state.referenceYear).toBe("2025")
        expect(state.alertPercent).toBe("85")
    })

    it("pula os anos que a propriedade já tem", () => {
        const state = referenceGoalForm(goal({ year: 2025 }), progressWith([]), 2026, [2027, 2028])

        expect(state.year).toBe("2029")
    })

    it("preenche cada mês com o realizado, arredondado, e deixa vazio o mês sem leitura", () => {
        const realized = [380.4, null, 410.6, 0, ...Array.from({ length: 8 }, () => 300)]
        const state = referenceGoalForm(goal({ year: 2025 }), progressWith(realized), 2026, [])

        expect(state.months.slice(0, 4)).toEqual(["380", "", "411", "0"])
        expect(state.months[4]).toBe("300")
        expect(state.months).toHaveLength(12)
    })

    it("o consumo específico é a média dos meses com leitura", () => {
        const state = referenceGoalForm(
            goal({ year: 2025 }),
            progressWith([300, null, 500]),
            2026,
            [],
        )

        expect(state.specificValue).toBe("400")
    })

    it("sem leitura nenhuma, ou sem acompanhamento, os meses e o específico ficam vazios", () => {
        for (const progress of [progressWith([]), undefined]) {
            const state = referenceGoalForm(goal({ year: 2025 }), progress, 2026, [])
            expect(state.months).toEqual(Array.from({ length: 12 }, () => ""))
            expect(state.specificValue).toBe("")
            expect(state.referenceYear).toBe("2025")
        }
    })

    it("o rascunho resultante passa na validação quando os 12 meses têm leitura", () => {
        const state = referenceGoalForm(
            goal({ year: 2025 }),
            progressWith(Array.from({ length: 12 }, () => 350)),
            2026,
            [],
        )

        expect(validateGoalForm(state, [])).toBeNull()
    })
})

describe("formatGoalPercent", () => {
    it('usa vírgula e uma casa decimal; ausência é "-"', () => {
        expect(formatGoalPercent(87.5)).toBe("87,5%")
        expect(formatGoalPercent(100)).toBe("100,0%")
        expect(formatGoalPercent(0)).toBe("0,0%")
        expect(formatGoalPercent(null)).toBe("-")
    })
})

describe("unidade da meta", () => {
    it("formata kWh e reais em números inteiros, com o separador de milhar brasileiro", () => {
        expect(formatGoalValue(4800, "KWH")).toBe("4.800 kWh")
        expect(formatGoalValue(4800.4, "BRL")).toBe("R$ 4.800")
        expect(formatGoalValue(0, "BRL")).toBe("R$ 0")
    })

    it("o realizado em reais usa a unidade do acompanhamento", () => {
        const progress = (unit: "KWH" | "BRL"): GoalProgress => ({
            goalId: "g1",
            year: 2026,
            unit,
            months: [],
            yearTarget: 4800,
            realized: 2220,
            deviationPercent: null,
            currentMonthTarget: null,
            situation: "IN_PROGRESS",
        })
        expect(formatRealized(progress("KWH"))).toBe("2.220 kWh")
        expect(formatRealized(progress("BRL"))).toBe("R$ 2.220")
    })

    it("cada unidade tem os próprios rótulos", () => {
        expect(goalUnitLabels("KWH")).toMatchObject({
            selector: "Consumo (kWh)",
            cardTitle: "Metas de consumo anual",
            specific: "Consumo específico alvo · kWh",
            months: "Meta mês a mês · kWh",
            monthStat: "Consumo específico alvo · meta do mês",
            newTitle: "Nova meta de consumo",
        })
        expect(goalUnitLabels("BRL")).toMatchObject({
            selector: "Custo (R$)",
            cardTitle: "Metas de custo anual",
            specific: "Custo mensal alvo · R$",
            months: "Meta mês a mês · R$",
            monthStat: "Custo alvo · meta do mês",
            newTitle: "Nova meta de custo",
        })
    })

    it("a frase da meta vigente em reais fala em custo e em reais", () => {
        const months = Array.from({ length: 12 }, (_, i) => (i + 1) * 100)
        const text = describeCurrentGoal(goal({ unit: "BRL", monthlyTargets: months }), 2)

        expect(text).toContain("Teto de R$ 7.800 para 2026")
        expect(text).toContain("meta do mês R$ 300")
    })

    it("a criação leva a unidade escolhida", () => {
        expect(buildGoalCreateInput(filled(), "p1", "BRL").unit).toBe("BRL")
    })

    it("usar como referência mantém o valor realizado em reais arredondado", () => {
        const progress: GoalProgress = {
            goalId: "g1",
            year: 2025,
            unit: "BRL",
            months: Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                target: 400,
                realized: i === 0 ? 310.6 : null,
            })),
            yearTarget: 4800,
            realized: 310.6,
            deviationPercent: null,
            currentMonthTarget: null,
            situation: "MET",
        }

        const state = referenceGoalForm(goal({ year: 2025, unit: "BRL" }), progress, 2026, [])

        expect(state.months[0]).toBe("311")
        expect(state.specificValue).toBe("311")
    })
})

describe("unidade de demanda (kW)", () => {
    it("formata a demanda em kW, em números inteiros", () => {
        expect(formatGoalValue(180, "KW")).toBe("180 kW")
        expect(formatGoalValue(1234.6, "KW")).toBe("1.235 kW")
    })

    it("a meta do ano de uma meta de demanda é a maior meta mensal, não a soma", () => {
        const monthlyTargets = Array.from({ length: 12 }, (_, i) => (i === 3 ? 220 : 180))

        expect(goalYearlyTotal(goal({ unit: "KW", monthlyTargets }))).toBe(220)
        expect(goalYearlyTotal(goal({ unit: "KWH", monthlyTargets }))).toBe(2200)
    })

    it("tem rótulos de demanda, com os cards de pico", () => {
        const labels = goalUnitLabels("KW")

        expect(labels).toMatchObject({
            selector: "Demanda (kW)",
            cardTitle: "Metas de demanda mensal",
            specific: "Demanda mensal alvo · kW",
            months: "Meta mês a mês · kW",
            monthStat: "Demanda alvo · meta do mês",
            newTitle: "Nova meta de demanda",
            editTitle: "Editar meta de demanda",
            deviationStat: "Pior mês",
        })
        expect(labels.yearStat(2026)).toBe("Maior meta de 2026")
        expect(labels.realizedStat("junho")).toBe("Maior demanda até junho")
        expect(labels.empty(2026)).toBe("Nenhuma meta de demanda cadastrada para 2026.")
    })

    it("consumo e custo mantêm os rótulos de total acumulado", () => {
        for (const unit of ["KWH", "BRL"] as const) {
            const labels = goalUnitLabels(unit)
            expect(labels.yearStat(2026)).toBe("Meta de 2026")
            expect(labels.realizedStat("junho")).toBe("Realizado até junho")
            expect(labels.deviationStat).toBe("Desvio acumulado")
        }
    })

    it("a meta de demanda só é oferecida a propriedade do Grupo A", () => {
        expect(availableGoalUnits("GROUP_A")).toEqual(["KWH", "BRL", "KW"])
        expect(availableGoalUnits("GROUP_B")).toEqual(["KWH", "BRL"])
        expect(availableGoalUnits(undefined)).toEqual(["KWH", "BRL"])
    })

    it("a frase da meta vigente de demanda fala em teto e em kW", () => {
        const monthlyTargets = Array.from({ length: 12 }, () => 180)
        const text = describeCurrentGoal(goal({ unit: "KW", monthlyTargets }), 2)

        expect(text).toContain("Teto de 180 kW para 2026")
        expect(text).toContain("meta do mês 180 kW")
    })

    it("usar como referência traz o pico realizado de cada mês, arredondado", () => {
        const progress: GoalProgress = {
            goalId: "g1",
            year: 2025,
            unit: "KW",
            months: Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                target: 180,
                realized: i === 0 ? 170.4 : null,
            })),
            yearTarget: 180,
            realized: 170.4,
            deviationPercent: null,
            currentMonthTarget: null,
            situation: "MET",
        }

        const state = referenceGoalForm(goal({ year: 2025, unit: "KW" }), progress, 2026, [])

        expect(state.months[0]).toBe("170")
        expect(state.months[1]).toBe("")
    })
})
