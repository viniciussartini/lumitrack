import { describe, it, expect } from "vitest"
import {
    createGoalBodySchema,
    listGoalsQuerySchema,
    updateGoalBodySchema,
} from "@/modules/goal/goal.schema.js"

const propertyId = "3f2b8c1e-9d4a-4c6e-8f21-0a1b2c3d4e5f"

const valid = {
    propertyId,
    year: 2026,
    referenceYear: 2025,
    monthlyTargets: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
}

const parse = (override: Record<string, unknown> = {}) =>
    createGoalBodySchema.safeParse({ ...valid, ...override })

describe("createGoalBodySchema", () => {
    it("aceita uma meta válida", () => {
        expect(parse().success).toBe(true)
    })

    describe("meta mês a mês", () => {
        it("exige exatamente 12 meses", () => {
            expect(parse({ monthlyTargets: Array.from({ length: 11 }, () => 400) }).success).toBe(
                false,
            )
            expect(parse({ monthlyTargets: Array.from({ length: 13 }, () => 400) }).success).toBe(
                false,
            )
            expect(parse({ monthlyTargets: [] }).success).toBe(false)
        })

        it("aceita mês zerado e rejeita negativo", () => {
            const withZero = [0, ...Array.from({ length: 11 }, () => 400)]
            const withNegative = [-1, ...Array.from({ length: 11 }, () => 400)]
            expect(parse({ monthlyTargets: withZero }).success).toBe(true)
            expect(parse({ monthlyTargets: withNegative }).success).toBe(false)
        })

        it("rejeita valor não numérico, infinito ou acima do teto", () => {
            const base = Array.from({ length: 11 }, () => 400)
            expect(parse({ monthlyTargets: ["400", ...base] }).success).toBe(false)
            expect(parse({ monthlyTargets: [Infinity, ...base] }).success).toBe(false)
            expect(parse({ monthlyTargets: [1e12, ...base] }).success).toBe(false)
        })
    })

    describe("percentual de alerta", () => {
        it("aceita de 10 a 100", () => {
            expect(parse({ alertPercent: 10 }).success).toBe(true)
            expect(parse({ alertPercent: 100 }).success).toBe(true)
        })

        it("rejeita abaixo de 10, acima de 100 e não inteiro", () => {
            expect(parse({ alertPercent: 9 }).success).toBe(false)
            expect(parse({ alertPercent: 101 }).success).toBe(false)
            expect(parse({ alertPercent: 85.5 }).success).toBe(false)
        })
    })

    describe("anos", () => {
        it("aceita de 2020 a 2100 e rejeita fora disso", () => {
            expect(parse({ year: 2100, referenceYear: 2099 }).success).toBe(true)
            expect(parse({ year: 2101 }).success).toBe(false)
            expect(parse({ year: 2020, referenceYear: 2019 }).success).toBe(false)
            expect(parse({ year: 2020.5 }).success).toBe(false)
        })

        it("o ano de referência é anterior ao da meta", () => {
            expect(parse({ year: 2026, referenceYear: 2026 }).success).toBe(false)
            expect(parse({ year: 2026, referenceYear: 2027 }).success).toBe(false)
            expect(parse({ year: 2026, referenceYear: 2020 }).success).toBe(true)
        })
    })

    it("rejeita propriedade que não é um uuid", () => {
        expect(parse({ propertyId: "casa" }).success).toBe(false)
    })
})

describe("unidade da meta", () => {
    it("assume consumo em kWh quando a unidade não é informada", () => {
        const result = parse()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.unit).toBe("KWH")
    })

    it("aceita a meta de custo em reais", () => {
        const result = parse({ unit: "BRL" })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.unit).toBe("BRL")
    })

    it("aceita a meta de demanda em kW", () => {
        const result = parse({ unit: "KW" })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.unit).toBe("KW")
    })

    it("rejeita unidade desconhecida", () => {
        expect(parse({ unit: "MWH" }).success).toBe(false)
        expect(parse({ unit: "" }).success).toBe(false)
    })

    it("a edição não carrega a unidade: ela identifica a meta", () => {
        const { propertyId: _property, year: _year, ...editable } = valid
        const result = updateGoalBodySchema.safeParse({ ...editable, unit: "BRL" })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).not.toHaveProperty("unit")
    })
})

describe("updateGoalBodySchema", () => {
    const { propertyId: _property, year: _year, ...editable } = valid

    it("aceita os campos editáveis", () => {
        expect(updateGoalBodySchema.safeParse(editable).success).toBe(true)
    })

    it("não carrega propriedade nem ano: campos extras são descartados", () => {
        const result = updateGoalBodySchema.safeParse({ ...editable, propertyId, year: 1999 })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).not.toHaveProperty("propertyId")
            expect(result.data).not.toHaveProperty("year")
        }
    })

    it("aplica os mesmos limites de mês e de percentual", () => {
        expect(updateGoalBodySchema.safeParse({ ...editable, alertPercent: 5 }).success).toBe(false)
        expect(updateGoalBodySchema.safeParse({ ...editable, monthlyTargets: [1] }).success).toBe(
            false,
        )
    })
})

describe("listGoalsQuerySchema", () => {
    it("exige a propriedade e assume a paginação padrão", () => {
        expect(listGoalsQuerySchema.safeParse({}).success).toBe(false)
        const result = listGoalsQuerySchema.safeParse({ propertyId })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toMatchObject({ page: 1, pageSize: 10 })
    })
})
