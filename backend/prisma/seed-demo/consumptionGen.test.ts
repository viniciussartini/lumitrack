import { describe, expect, it } from "vitest"
import { createRng, generateMinuteReading } from "./consumptionGen.js"

// Datas de referência (UTC) para horários locais (Brasil, -03:00) conhecidos.
const weekdayNight = new Date("2025-09-03T05:00:00.000Z") // qua 02:00 local — vale, sem pico
const weekdayEvening = new Date("2025-09-03T23:30:00.000Z") // qua 20:30 local — pico noturno residencial
const weekendEvening = new Date("2025-09-07T23:30:00.000Z") // dom 20:30 local — fim de semana
const sundayNoon = new Date("2025-09-07T15:00:00.000Z") // dom 12:00 local — loja fechada
const wednesdayBusinessHour = new Date("2025-09-03T18:00:00.000Z") // qua 15:00 local — loja aberta
const wednesdayOvenProduction = new Date("2025-09-03T09:00:00.000Z") // qua 06:00 local — forno em produção
const wednesdayOvenIdle = new Date("2025-09-03T15:00:00.000Z") // qua 12:00 local — forno fora de produção

describe("createRng", () => {
    it("é determinístico: a mesma seed produz a mesma sequência", () => {
        const a = createRng(42)
        const b = createRng(42)
        const seqA = Array.from({ length: 20 }, () => a())
        const seqB = Array.from({ length: 20 }, () => b())
        expect(seqA).toEqual(seqB)
    })

    it("produz valores uniformes em [0,1)", () => {
        const rng = createRng(1)
        for (let i = 0; i < 1000; i++) {
            const v = rng()
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThan(1)
        }
    })
})

describe("generateMinuteReading — coerência física e validade", () => {
    it.each([
        ["RESIDENTIAL", weekdayEvening],
        ["COMMERCIAL_GENERAL", wednesdayBusinessHour],
        ["SALES_AREA", wednesdayBusinessHour],
        ["OVEN", wednesdayOvenProduction],
    ] as const)("%s: P = V·I·PF dentro de tolerância de arredondamento", (profile, at) => {
        const reading = generateMinuteReading(profile, at, createRng(7))
        if (reading.avgPowerW === 0) return
        expect(reading.avgVoltage * reading.avgCurrent * reading.avgPowerFactor).toBeCloseTo(
            reading.avgPowerW,
            5,
        )
    })

    it.each(["RESIDENTIAL", "COMMERCIAL_GENERAL", "SALES_AREA", "OVEN"] as const)(
        "%s: campos sempre válidos contra o predicado do IoTDataProcessor real",
        (profile) => {
            const rng = createRng(99)
            for (let i = 0; i < 200; i++) {
                const at = new Date(weekdayEvening.getTime() + i * 60_000)
                const reading = generateMinuteReading(profile, at, rng)
                expect(Number.isFinite(reading.avgVoltage) && reading.avgVoltage >= 0).toBe(true)
                expect(Number.isFinite(reading.avgCurrent) && reading.avgCurrent >= 0).toBe(true)
                expect(Number.isFinite(reading.avgPowerW) && reading.avgPowerW >= 0).toBe(true)
                expect(reading.avgPowerFactor).toBeGreaterThanOrEqual(0)
                expect(reading.avgPowerFactor).toBeLessThanOrEqual(1)
                expect(reading.kwhConsumed).toBeGreaterThanOrEqual(0)
            }
        },
    )
})

describe("perfil RESIDENTIAL", () => {
    it("pico noturno é maior que o consumo de madrugada", () => {
        const night = generateMinuteReading("RESIDENTIAL", weekdayNight, createRng(1))
        const evening = generateMinuteReading("RESIDENTIAL", weekdayEvening, createRng(1))
        expect(evening.avgPowerW).toBeGreaterThan(night.avgPowerW)
    })

    it("fim de semana consome mais que dia de semana no mesmo horário", () => {
        const weekday = generateMinuteReading("RESIDENTIAL", weekdayEvening, createRng(1))
        const weekend = generateMinuteReading("RESIDENTIAL", weekendEvening, createRng(1))
        expect(weekend.avgPowerW).toBeGreaterThan(weekday.avgPowerW)
    })
})

describe("perfil COMMERCIAL_GENERAL", () => {
    it("domingo (fechado) consome muito menos que horário comercial", () => {
        const closed = generateMinuteReading("COMMERCIAL_GENERAL", sundayNoon, createRng(1))
        const open = generateMinuteReading(
            "COMMERCIAL_GENERAL",
            wednesdayBusinessHour,
            createRng(1),
        )
        expect(open.avgPowerW).toBeGreaterThan(closed.avgPowerW * 5)
    })
})

describe("perfil OVEN", () => {
    it("fica essencialmente desligado fora da janela de produção", () => {
        const idle = generateMinuteReading("OVEN", wednesdayOvenIdle, createRng(1))
        expect(idle.avgPowerW).toBeLessThan(100)
    })

    it("consome significativamente mais durante a janela de produção (média de várias rajadas)", () => {
        const rng = createRng(3)
        let idleTotal = 0
        let productionTotal = 0
        const samples = 30
        for (let i = 0; i < samples; i++) {
            idleTotal += generateMinuteReading(
                "OVEN",
                new Date(wednesdayOvenIdle.getTime() + i * 60_000),
                rng,
            ).avgPowerW
            productionTotal += generateMinuteReading(
                "OVEN",
                new Date(wednesdayOvenProduction.getTime() + i * 60_000),
                rng,
            ).avgPowerW
        }
        expect(productionTotal / samples).toBeGreaterThan((idleTotal / samples) * 5)
    })

    it("domingo fica zerado mesmo em horário de produção", () => {
        const sundayProduction = new Date("2025-09-07T09:00:00.000Z") // dom 06:00 local
        const reading = generateMinuteReading("OVEN", sundayProduction, createRng(1))
        expect(reading.avgPowerW).toBe(0)
    })
})

describe("anomalia", () => {
    it("multiplicador aumenta a potência-alvo e aplica leve sag de tensão", () => {
        const normal = generateMinuteReading("RESIDENTIAL", weekdayEvening, createRng(5))
        const anomalous = generateMinuteReading("RESIDENTIAL", weekdayEvening, createRng(5), 3)
        expect(anomalous.avgPowerW).toBeGreaterThan(normal.avgPowerW * 2)
        expect(anomalous.avgVoltage).toBeLessThan(normal.avgVoltage)
    })
})
