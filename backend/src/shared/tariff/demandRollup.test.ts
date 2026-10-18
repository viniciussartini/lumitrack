import { describe, it, expect } from "vitest"
import {
    computeDemandDayPoints,
    computeTrailingWindowAverage,
    type TrailingReading,
} from "@/shared/tariff/demandRollup.js"

const MINUTE_MS = 60 * 1000

function minute(offsetFromEnd: number, end: Date): Date {
    return new Date(end.getTime() - offsetFromEnd * MINUTE_MS)
}

// 15 leituras contíguas terminando em `end`, todas com a mesma potência e
// cobertura plena (60s) — usado como base para os testes que introduzem
// desvios pontuais (gap, cobertura zero, potência diferente).
function contiguousReadings(end: Date, powerW = 1000): TrailingReading[] {
    return Array.from({ length: 15 }, (_, i) => ({
        minuteStart: minute(i, end),
        avgPowerW: powerW,
        secondsCovered: 60,
    }))
}

describe("computeTrailingWindowAverage", () => {
    const windowEnd = new Date(Date.UTC(2026, 8, 8, 19, 0))

    it("calcula a média ponderada de uma janela completa e contígua", () => {
        const readings = contiguousReadings(windowEnd, 1000)
        expect(computeTrailingWindowAverage(readings, windowEnd)).toBe(1000)
    })

    it("pondera pela cobertura em segundos, não pela média simples", () => {
        const readings = contiguousReadings(windowEnd, 1000)
        // Uma das 15 leituras teve só 6s de cobertura (ao invés de 60s) e
        // potência bem diferente — deve pesar pouco no resultado.
        readings[7] = { minuteStart: minute(7, windowEnd), avgPowerW: 5000, secondsCovered: 6 }

        const totalWeight = 14 * 60 + 6
        const expected = (14 * 60 * 1000 + 6 * 5000) / totalWeight

        expect(computeTrailingWindowAverage(readings, windowEnd)).toBeCloseTo(expected, 6)
    })

    it("retorna null quando há menos de 15 leituras", () => {
        const readings = contiguousReadings(windowEnd).slice(0, 12)
        expect(computeTrailingWindowAverage(readings, windowEnd)).toBeNull()
    })

    it("retorna null quando há um buraco de 1 minuto no meio da janela (medidor offline)", () => {
        const readings = contiguousReadings(windowEnd)
        // 15 leituras presentes, mas a partir da 8ª todas deslocadas 1 minuto
        // pra trás — um buraco real no meio da janela (offset 7 nunca
        // aparece), mesmo com a contagem batendo em 15.
        for (let i = 7; i < 15; i++) {
            readings[i] = { ...readings[i]!, minuteStart: minute(i + 1, windowEnd) }
        }
        expect(computeTrailingWindowAverage(readings, windowEnd)).toBeNull()
    })

    it("retorna null quando a leitura mais recente não é o minuto final esperado", () => {
        // As 15 leituras são contíguas entre si, mas terminam 1 minuto antes
        // do fim de janela pedido — o medidor não tem dado do minuto mais
        // recente ainda (ex.: rollup atrasado).
        const readings = contiguousReadings(minute(1, windowEnd))
        expect(computeTrailingWindowAverage(readings, windowEnd)).toBeNull()
    })

    it("não deixa uma leitura isolada de cobertura zero derrubar a média (peso zero, não NaN)", () => {
        const readings = contiguousReadings(windowEnd, 1000)
        readings[3] = { minuteStart: minute(3, windowEnd), avgPowerW: 999999, secondsCovered: 0 }

        expect(computeTrailingWindowAverage(readings, windowEnd)).toBe(1000)
    })

    it("retorna null quando o peso total da janela é zero", () => {
        const readings = contiguousReadings(windowEnd, 1000).map((r) => ({
            ...r,
            secondsCovered: 0,
        }))
        expect(computeTrailingWindowAverage(readings, windowEnd)).toBeNull()
    })
})

describe("computeDemandDayPoints", () => {
    // Meia-noite de São Paulo (UTC-3) de 16/10/2026.
    const dayStart = new Date(Date.UTC(2026, 9, 16, 3, 0))
    const at = (minuteOfDay: number): Date => new Date(dayStart.getTime() + minuteOfDay * MINUTE_MS)

    // Uma leitura por minuto, de `fromMinute` a `toMinute` (inclusive), no dia.
    const readingsBetween = (fromMinute: number, toMinute: number, powerW = 1000) =>
        Array.from({ length: toMinute - fromMinute + 1 }, (_, i) => ({
            minuteStart: at(fromMinute + i),
            avgPowerW: powerW,
            secondsCovered: 60,
        }))

    it("devolve as 96 janelas alinhadas ao quarto de hora, com o fim em :14, :29, :44 e :59", () => {
        const points = computeDemandDayPoints(readingsBetween(0, 1439), dayStart, at(1439))

        expect(points).toHaveLength(96)
        expect(points[0]!.windowEnd).toEqual(at(14))
        expect(points[1]!.windowEnd).toEqual(at(29))
        expect(points[95]!.windowEnd).toEqual(at(1439))
        expect(points.every((point) => point.avgPowerW === 1000)).toBe(true)
    })

    it("janela que ainda não fechou é ausência, não zero", () => {
        const points = computeDemandDayPoints(readingsBetween(0, 629), dayStart, at(629))

        // 10:29 fecha a janela de índice 41; a seguinte (fim às 10:44) ainda não
        expect(points[41]!.avgPowerW).toBe(1000)
        expect(points[42]!.avgPowerW).toBeNull()
        expect(points.slice(42).every((point) => point.avgPowerW === null)).toBe(true)
    })

    it("buraco de um minuto derruba só a janela que o contém, como a janela do rollup", () => {
        const readings = readingsBetween(0, 1439).filter(
            (reading) => reading.minuteStart.getTime() !== at(65).getTime(),
        )

        const points = computeDemandDayPoints(readings, dayStart, at(1439))

        // 01:05 pertence à janela 01:00-01:14 (índice 4)
        expect(points[3]!.avgPowerW).toBe(1000)
        expect(points[4]!.avgPowerW).toBeNull()
        expect(points[5]!.avgPowerW).toBe(1000)
    })

    it("pondera pela cobertura em segundos, na mesma conta da janela do rollup", () => {
        const readings = readingsBetween(0, 14)
        readings[7] = { minuteStart: at(7), avgPowerW: 5000, secondsCovered: 6 }

        const [first] = computeDemandDayPoints(readings, dayStart, at(14))

        expect(first!.avgPowerW).toBeCloseTo((14 * 60 * 1000 + 6 * 5000) / (14 * 60 + 6), 6)
    })

    it("sem leitura nenhuma todas as janelas são ausência", () => {
        const points = computeDemandDayPoints([], dayStart, at(1439))

        expect(points).toHaveLength(96)
        expect(points.every((point) => point.avgPowerW === null)).toBe(true)
    })
})
