import { describe, it, expect } from "vitest"
import { computeTrailingWindowAverage, type TrailingReading } from "@/shared/tariff/demandRollup.js"

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
