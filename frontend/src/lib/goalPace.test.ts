import { describe, expect, it } from "vitest"
import {
    buildMonthPace,
    buildYearPace,
    closingSituation,
    dailyValuesFromBuckets,
    projectMonthClosing,
    projectYearClosing,
} from "@/lib/goalPace"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { GoalProgressMonth } from "@/types/goal.types"

const bucket = (day: number, kwh: number, cost?: number): ConsumptionBucket => ({
    bucketStart: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    kwhConsumed: kwh,
    avgPowerW: 0,
    ...(cost !== undefined && { costBrl: cost }),
})

const month = (index: number, target: number, realized: number | null): GoalProgressMonth => ({
    month: index + 1,
    target,
    realized,
})

describe("dailyValuesFromBuckets", () => {
    it("lê o dia dos dígitos do bucket, sem deslocar o fuso", () => {
        const values = dailyValuesFromBuckets([bucket(1, 5), bucket(15, 7)], "KWH")

        expect(values).toEqual([
            { day: 1, value: 5 },
            { day: 15, value: 7 },
        ])
    })

    it("em R$ usa o custo e deixa de fora o dia sem custo, nunca como 0", () => {
        const values = dailyValuesFromBuckets([bucket(1, 5, 4.5), bucket(2, 6)], "BRL")

        expect(values).toEqual([{ day: 1, value: 4.5 }])
    })
})

describe("projectMonthClosing", () => {
    it("projeta linearmente pelos dias com leitura", () => {
        expect(projectMonthClosing({ accumulated: 150, readingDays: 15, daysInMonth: 30 })).toBe(
            300,
        )
    })

    it("sem nenhum dia com leitura não há projeção (mês no início)", () => {
        expect(projectMonthClosing({ accumulated: 0, readingDays: 0, daysInMonth: 31 })).toBeNull()
    })

    it("no fim do mês a projeção converge para o acumulado", () => {
        expect(projectMonthClosing({ accumulated: 290, readingDays: 29, daysInMonth: 30 })).toBe(
            300,
        )
    })
})

describe("projectYearClosing", () => {
    it("usa só os meses fechados com leitura e ignora o mês corrente parcial", () => {
        const months = [
            month(0, 100, 90),
            month(1, 100, 110),
            month(2, 100, 5), // mês corrente, parcial
            month(3, 100, null),
        ]

        expect(projectYearClosing(months, 2)).toBe(1200)
    })

    it("mês fechado sem leitura fica fora do divisor — o buraco não vira economia", () => {
        const months = [
            month(0, 100, 100),
            month(1, 100, null),
            month(2, 100, 100),
            month(3, 100, 0),
        ]

        expect(projectYearClosing(months, 3)).toBe(1200)
    })

    it("sem mês fechado com leitura não há projeção", () => {
        expect(projectYearClosing([month(0, 100, 40)], 0)).toBeNull()
        expect(projectYearClosing([month(0, 100, null), month(1, 100, 10)], 1)).toBeNull()
    })
})

describe("closingSituation", () => {
    it("é o desvio da projeção em relação à meta", () => {
        expect(closingSituation(330, 300)).toBeCloseTo(10)
        expect(closingSituation(270, 300)).toBeCloseTo(-10)
    })

    it("meta zerada ou projeção ausente não têm situação", () => {
        expect(closingSituation(100, 0)).toBeNull()
        expect(closingSituation(null, 300)).toBeNull()
    })
})

describe("buildMonthPace", () => {
    it("no meio do mês acumula os dias e traça a meta proporcional aos dias", () => {
        const daily = Array.from({ length: 15 }, (_, i) => ({ day: i + 1, value: 10 }))

        const pace = buildMonthPace({
            daily,
            closedDays: 15,
            daysInMonth: 30,
            target: 300,
        })

        expect(pace.accumulated).toBe(150)
        expect(pace.projected).toBe(300)
        expect(pace.situationPercent).toBe(0)
        expect(pace.points).toHaveLength(30)
        expect(pace.points[0]).toEqual({ label: "1", accumulated: 10, targetAccumulated: 10 })
        expect(pace.points[14]).toEqual({ label: "15", accumulated: 150, targetAccumulated: 150 })
        // dias que ainda não fecharam: sem barra, só a meta
        expect(pace.points[15]).toEqual({ label: "16", accumulated: null, targetAccumulated: 160 })
        expect(pace.points[29]?.targetAccumulated).toBe(300)
    })

    it("no início do mês (nenhum dia fechado) tudo é ausência", () => {
        const pace = buildMonthPace({ daily: [], closedDays: 0, daysInMonth: 31, target: 310 })

        expect(pace.accumulated).toBeNull()
        expect(pace.projected).toBeNull()
        expect(pace.situationPercent).toBeNull()
        expect(pace.points.every((point) => point.accumulated === null)).toBe(true)
    })

    it("dia sem leitura fica sem barra e fora do acumulado e do divisor", () => {
        const daily = [
            { day: 1, value: 10 },
            { day: 3, value: 10 },
            { day: 4, value: 10 },
        ]

        const pace = buildMonthPace({ daily, closedDays: 4, daysInMonth: 30, target: 300 })

        expect(pace.points[1]?.accumulated).toBeNull()
        expect(pace.points[2]?.accumulated).toBe(20)
        expect(pace.accumulated).toBe(30)
        // 30 kWh em 3 dias com leitura → 10/dia × 30 dias
        expect(pace.projected).toBe(300)
    })

    it("projeção acima da meta dá situação positiva", () => {
        const daily = Array.from({ length: 10 }, (_, i) => ({ day: i + 1, value: 12 }))

        const pace = buildMonthPace({ daily, closedDays: 10, daysInMonth: 30, target: 300 })

        expect(pace.projected).toBe(360)
        expect(pace.situationPercent).toBeCloseTo(20)
    })

    it("meta zerada: acumula e projeta, mas não há situação", () => {
        const pace = buildMonthPace({
            daily: [{ day: 1, value: 5 }],
            closedDays: 1,
            daysInMonth: 30,
            target: 0,
        })

        expect(pace.projected).toBe(150)
        expect(pace.situationPercent).toBeNull()
    })
})

describe("buildYearPace", () => {
    it("acumula os meses com leitura contra a meta acumulada mês a mês", () => {
        const months = [
            month(0, 100, 90),
            month(1, 100, 130),
            month(2, 100, 20),
            ...Array.from({ length: 9 }, (_, i) => month(i + 3, 100, null)),
        ]

        const pace = buildYearPace({ months, yearTarget: 1200, currentMonthIndex: 2 })

        expect(pace.accumulated).toBe(240)
        expect(pace.points[0]).toEqual({ label: "jan", accumulated: 90, targetAccumulated: 100 })
        expect(pace.points[1]).toEqual({ label: "fev", accumulated: 220, targetAccumulated: 200 })
        expect(pace.points[3]).toEqual({ label: "abr", accumulated: null, targetAccumulated: 400 })
        // média dos meses fechados (90 e 130) × 12
        expect(pace.projected).toBe(1320)
        expect(pace.situationPercent).toBeCloseTo(10)
    })

    it("mês sem leitura no meio não tem barra e o acumulado segue depois dele", () => {
        const months = [
            month(0, 100, 100),
            month(1, 100, null),
            month(2, 100, 100),
            ...Array.from({ length: 9 }, (_, i) => month(i + 3, 100, null)),
        ]

        const pace = buildYearPace({ months, yearTarget: 1200, currentMonthIndex: 3 })

        expect(pace.points[1]?.accumulated).toBeNull()
        expect(pace.points[2]?.accumulated).toBe(200)
        expect(pace.accumulated).toBe(200)
    })

    it("ano sem nenhuma leitura é ausência, não zero", () => {
        const months = Array.from({ length: 12 }, (_, i) => month(i, 100, null))

        const pace = buildYearPace({ months, yearTarget: 1200, currentMonthIndex: 5 })

        expect(pace.accumulated).toBeNull()
        expect(pace.projected).toBeNull()
        expect(pace.situationPercent).toBeNull()
    })

    it("meta do ano zerada não tem situação", () => {
        const months = [
            month(0, 0, 50),
            ...Array.from({ length: 11 }, (_, i) => month(i + 1, 0, null)),
        ]

        const pace = buildYearPace({ months, yearTarget: 0, currentMonthIndex: 1 })

        expect(pace.projected).toBe(600)
        expect(pace.situationPercent).toBeNull()
    })
})
