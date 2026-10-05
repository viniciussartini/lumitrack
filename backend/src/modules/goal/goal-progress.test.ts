import { describe, it, expect } from "vitest"
import type { GoalUnit } from "@/generated/prisma/client.js"
import { computeGoalProgress, yearlyTarget } from "@/modules/goal/goal-progress.js"

const twelve = <T>(fill: (month: number) => T): T[] => Array.from({ length: 12 }, (_, i) => fill(i))
const target = (kwh = 400) => twelve(() => kwh)

// 15/06/2026 12:00 em São Paulo: junho tem 30 dias, então o mês está na metade.
const MID_JUNE_2026 = new Date("2026-06-15T15:00:00.000Z")

const input = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) => ({
    year: 2026,
    unit: "KWH" as GoalUnit,
    monthlyTargets: target(),
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

        expect(result.comparedTarget).toBeCloseTo(2200)
        expect(result.realized).toBe(2220)
        expect(result.deviationPercent).toBeCloseTo((2220 / 2200 - 1) * 100)
        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.yearTarget).toBe(4800)
        expect(result.currentMonthTarget).toBe(400)
    })

    it("devolve os 12 meses com a meta de cada um e o realizado só até o mês corrente", () => {
        const result = computeGoalProgress(
            input({
                monthlyTargets: twelve((i) => (i + 1) * 100),
                realizedByMonth: realized(90, 210, 310, 390, 520, 100, 999),
            }),
        )

        expect(result.months).toHaveLength(12)
        expect(result.months[0]).toEqual({ month: 1, target: 100, realized: 90 })
        expect(result.months[5]).toEqual({ month: 6, target: 600, realized: 100 })
        // Julho em diante ainda não aconteceu: ignora qualquer valor recebido.
        expect(result.months[6]).toEqual({ month: 7, target: 700, realized: null })
        expect(result.currentMonthTarget).toBe(600)
    })

    it("mês anterior sem leitura fica fora dos dois lados do desvio", () => {
        // Só março e junho têm leitura: meta comparada = 400 + metade de junho (200).
        const result = computeGoalProgress(
            input({ realizedByMonth: realized(null, null, 380, null, null, 190) }),
        )

        expect(result.comparedTarget).toBeCloseTo(600)
        expect(result.realized).toBe(570)
        expect(result.deviationPercent).toBeCloseTo((570 / 600 - 1) * 100)
    })

    it("mês corrente sem leitura não entra na meta comparada", () => {
        const result = computeGoalProgress(
            input({ realizedByMonth: realized(400, 400, 400, 400, 400, null) }),
        )

        expect(result.comparedTarget).toBe(2000)
        expect(result.realized).toBe(2000)
        expect(result.deviationPercent).toBeCloseTo(0)
    })

    it("sem nenhuma leitura, realizado e desvio são ausência — nunca zero", () => {
        const result = computeGoalProgress(input())

        expect(result.realized).toBeNull()
        expect(result.comparedTarget).toBeNull()
        expect(result.deviationPercent).toBeNull()
        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.months.every((m) => m.realized === null)).toBe(true)
    })

    it("mês com leitura zerada é medição, não ausência", () => {
        const result = computeGoalProgress(input({ realizedByMonth: realized(0) }))

        expect(result.months[0]?.realized).toBe(0)
        expect(result.realized).toBe(0)
        expect(result.deviationPercent).toBeCloseTo(-100)
    })

    it("meta zerada nos meses comparados não divide por zero", () => {
        const result = computeGoalProgress(
            input({ monthlyTargets: target(0), realizedByMonth: realized(50) }),
        )

        expect(result.comparedTarget).toBe(0)
        expect(result.realized).toBe(50)
        expect(result.deviationPercent).toBeNull()
    })

    it("o dia 31 e o fim de fevereiro usam os dias do próprio mês", () => {
        const endOfJanuary = new Date("2026-01-31T15:00:00.000Z")
        const january = computeGoalProgress(
            input({ now: endOfJanuary, realizedByMonth: realized(400) }),
        )
        expect(january.comparedTarget).toBeCloseTo(400)

        const midFebruary = new Date("2026-02-14T15:00:00.000Z")
        const february = computeGoalProgress(
            input({ now: midFebruary, realizedByMonth: realized(null, 100) }),
        )
        // 14 de 28 dias de fevereiro.
        expect(february.comparedTarget).toBeCloseTo(200)
    })

    it("a virada do ano é em São Paulo: 01:00 UTC de 1º de janeiro ainda é dezembro", () => {
        const stillLastYear = new Date("2027-01-01T01:00:00.000Z")

        const lastYear = computeGoalProgress(input({ year: 2026, now: stillLastYear }))
        expect(lastYear.situation).toBe("IN_PROGRESS")
        expect(lastYear.currentMonthTarget).toBe(400)

        const nextYear = computeGoalProgress(input({ year: 2027, now: stillLastYear }))
        expect(nextYear.situation).toBe("IN_PROGRESS")
        expect(nextYear.currentMonthTarget).toBeNull()
    })
})

describe("computeGoalProgress — ano passado", () => {
    const past = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) =>
        input({ year: 2025, ...override })

    it("cumprida quando o realizado não passa da meta", () => {
        const result = computeGoalProgress(past({ realizedByMonth: twelve(() => 390) }))

        expect(result.situation).toBe("MET")
        expect(result.realized).toBe(4680)
        expect(result.comparedTarget).toBe(4800)
        expect(result.deviationPercent).toBeCloseTo((4680 / 4800 - 1) * 100)
        expect(result.currentMonthTarget).toBeNull()
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
        expect(result.realized).toBeNull()
        expect(result.deviationPercent).toBeNull()
    })

    it("o veredito usa só os meses com leitura, na mesma base do desvio", () => {
        // Só jan–mar têm leitura (1.200 contra 1.200 de meta): cumprida.
        const result = computeGoalProgress(past({ realizedByMonth: realized(400, 400, 400) }))

        expect(result.situation).toBe("MET")
        expect(result.comparedTarget).toBe(1200)
    })

    it("meta zerada com consumo registrado não é cumprida", () => {
        const result = computeGoalProgress(
            past({ monthlyTargets: target(0), realizedByMonth: realized(10) }),
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
        expect(result.realized).toBeNull()
        expect(result.deviationPercent).toBeNull()
        expect(result.currentMonthTarget).toBeNull()
        expect(result.months.every((m) => m.realized === null)).toBe(true)
        expect(result.yearTarget).toBe(4800)
    })
})

describe("computeGoalProgress — demanda em kW (pico)", () => {
    const peak = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) =>
        computeGoalProgress(input({ unit: "KW", monthlyTargets: twelve(() => 180), ...override }))

    it("a meta do ano é a maior meta mensal, não a soma", () => {
        const monthlyTargets = twelve((i) => (i === 3 ? 220 : 180))

        expect(peak({ monthlyTargets }).yearTarget).toBe(220)
    })

    it("o realizado do ano é a maior demanda medida, não a soma", () => {
        const result = peak({ realizedByMonth: realized(150, 190, 170) })

        expect(result.realized).toBe(190)
    })

    it("o desvio é o do pior mês, contra a meta daquele mês", () => {
        const monthlyTargets = twelve((i) => (i === 1 ? 200 : 180))
        // jan 162/180 = 0,9; fev 190/200 = 0,95; mar 198/180 = 1,1 (o pior).
        const result = peak({ monthlyTargets, realizedByMonth: realized(162, 190, 198) })

        expect(result.deviationPercent).toBeCloseTo(10)
        expect(result.comparedTarget).toBe(180)
    })

    it("sem mês acima do teto, o desvio é o do mês mais próximo dele, e negativo", () => {
        const result = peak({ realizedByMonth: realized(90, 144, 108) })

        expect(result.deviationPercent).toBeCloseTo(-20)
    })

    it("o mês corrente não é proporcional: o pico até agora vale contra o teto inteiro", () => {
        // Metade de junho, pico já em 90% do teto do mês.
        const result = peak({ realizedByMonth: realized(null, null, null, null, null, 162) })

        expect(result.deviationPercent).toBeCloseTo(-10)
        expect(result.comparedTarget).toBe(180)
    })

    it("mês sem janela medida fica fora, nunca vira 0", () => {
        const result = peak({ realizedByMonth: realized(null, 190, null) })

        expect(result.months[0]?.realized).toBeNull()
        expect(result.months[1]?.realized).toBe(190)
        expect(result.realized).toBe(190)
    })

    it("sem nenhuma leitura, tudo é ausência e a situação do ano corrente é em andamento", () => {
        const result = peak()

        expect(result.realized).toBeNull()
        expect(result.comparedTarget).toBeNull()
        expect(result.deviationPercent).toBeNull()
        expect(result.situation).toBe("IN_PROGRESS")
    })

    it("a meta do mês corrente continua disponível para o card", () => {
        expect(peak().currentMonthTarget).toBe(180)
    })

    it("ano passado: cumprida se nenhum mês passou do teto", () => {
        const result = peak({ year: 2025, realizedByMonth: realized(180, 100, 170) })

        expect(result.situation).toBe("MET")
    })

    it("ano passado: não cumprida se algum mês passou do teto, mesmo que a média esteja baixa", () => {
        const result = peak({ year: 2025, realizedByMonth: realized(50, 50, 181, 50) })

        expect(result.situation).toBe("NOT_MET")
    })

    it("ano passado sem nenhuma leitura fica sem situação", () => {
        expect(peak({ year: 2025 }).situation).toBeNull()
    })

    it("meta zerada com demanda medida estoura o teto, mas não tem desvio percentual", () => {
        const result = peak({
            year: 2025,
            monthlyTargets: twelve(() => 0),
            realizedByMonth: realized(10),
        })

        expect(result.situation).toBe("NOT_MET")
        expect(result.deviationPercent).toBeNull()
    })

    it("ano futuro está em andamento, sem realizado", () => {
        const result = peak({ year: 2027, realizedByMonth: twelve(() => 999) })

        expect(result.situation).toBe("IN_PROGRESS")
        expect(result.realized).toBeNull()
        expect(result.deviationPercent).toBeNull()
    })

    it("kWh e R$ seguem somando: a mudança é só da demanda", () => {
        const kwh = computeGoalProgress(input({ unit: "KWH", realizedByMonth: realized(100, 100) }))
        const brl = computeGoalProgress(input({ unit: "BRL", realizedByMonth: realized(100, 100) }))

        expect(kwh.realized).toBe(200)
        expect(brl.realized).toBe(200)
        expect(kwh.yearTarget).toBe(4800)
    })
})

describe("computeGoalProgress — custo em R$", () => {
    const cost = (override: Partial<Parameters<typeof computeGoalProgress>[0]> = {}) =>
        computeGoalProgress(input({ unit: "BRL", ...override }))

    it("o mês corrente conta contra a meta cheia: o custo fixo do dia 1 não é desvio", () => {
        // Metade de junho, mas o custo já traz CIP, piso e demanda contratada: 150 de uma meta de 400.
        const result = cost({ realizedByMonth: realized(400, 400, 400, 400, 400, 150) })

        expect(result.comparedTarget).toBe(2400)
        expect(result.realized).toBe(2150)
        expect(result.deviationPercent).toBeCloseTo((2150 / 2400 - 1) * 100)
    })

    it("custo fixo maior que a meta proporcional não vira desvio vermelho no começo do mês", () => {
        // 1º de janeiro: 1/31 da meta de 400 seriam ~13; o custo fixo de 120 está abaixo da meta cheia.
        const result = cost({
            now: new Date("2026-01-01T15:00:00.000Z"),
            realizedByMonth: realized(120),
        })

        expect(result.deviationPercent).toBeCloseTo((120 / 400 - 1) * 100)
        expect(result.deviationPercent).toBeLessThan(0)
    })

    it("o custo que passa da meta cheia do mês corrente é desvio positivo", () => {
        const result = cost({ realizedByMonth: realized(400, 400, 400, 400, 400, 500) })

        expect(result.deviationPercent).toBeCloseTo((2500 / 2400 - 1) * 100)
    })

    it("mês corrente sem leitura continua fora da comparação", () => {
        const result = cost({ realizedByMonth: realized(400, 400, 400, 400, 400) })

        expect(result.comparedTarget).toBe(2000)
    })

    it("o consumo em kWh segue proporcional aos dias", () => {
        const result = computeGoalProgress(
            input({ unit: "KWH", realizedByMonth: realized(400, 400, 400, 400, 400, 150) }),
        )

        expect(result.comparedTarget).toBeCloseTo(2200)
    })

    it("ano passado em R$ compara meses inteiros, como antes", () => {
        const result = cost({ year: 2025, realizedByMonth: twelve(() => 400) })

        expect(result.comparedTarget).toBe(4800)
        expect(result.situation).toBe("MET")
    })
})

describe("yearlyTarget", () => {
    it("soma os 12 meses em kWh e em R$", () => {
        expect(
            yearlyTarget(
                "KWH",
                twelve(() => 400),
            ),
        ).toBe(4800)
        expect(
            yearlyTarget(
                "BRL",
                twelve((i) => i * 100),
            ),
        ).toBe(6600)
    })

    it("na demanda é a maior meta mensal, não a soma", () => {
        expect(
            yearlyTarget(
                "KW",
                twelve((i) => (i === 3 ? 220 : 180)),
            ),
        ).toBe(220)
    })

    it("sem meta nenhuma é zero", () => {
        expect(
            yearlyTarget(
                "KW",
                twelve(() => 0),
            ),
        ).toBe(0)
    })
})
