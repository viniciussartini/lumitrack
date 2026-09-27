import { describe, it, expect } from "vitest"
import { buildElectricalQuantityCards } from "@/lib/electricalQuantities"
import type { ReadingPayload } from "@/lib/sse/appStream"

const FULL_READING: ReadingPayload = {
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW: 2200,
    powerFactor: 0.95,
    receivedAt: "2026-01-01T00:00:00.000Z",
    voltagePhaseA: 219,
    voltagePhaseB: 221,
    voltagePhaseC: 220,
    voltageUnbalance: 0.45,
    currentPhaseA: 9.8,
    currentPhaseB: 10.1,
    currentPhaseC: 9.9,
    activePowerPhaseA: 700,
    activePowerPhaseB: 750,
    activePowerPhaseC: 720,
    reactivePowerVar: 940,
    apparentPowerVa: 2350,
    frequencyHz: 59.98,
    powerFactorPhaseA: 0.95,
    powerFactorPhaseB: 0.93,
    powerFactorPhaseC: 0.96,
    thdVoltagePhaseA: 2.6,
    thdVoltagePhaseB: 2.9,
    thdVoltagePhaseC: 3.1,
    thdCurrentPhaseA: 6.1,
    thdCurrentPhaseB: 7.2,
    thdCurrentPhaseC: 5.9,
}

const findCard = (cards: ReturnType<typeof buildElectricalQuantityCards>, key: string) => {
    const card = cards.find((c) => c.key === key)
    if (!card) throw new Error(`card ${key} não encontrado`)
    return card
}

const findRow = (rows: { label: string; value: string }[], label: string) => {
    const row = rows.find((r) => r.label === label)
    if (!row) throw new Error(`linha "${label}" não encontrada`)
    return row
}

describe("buildElectricalQuantityCards", () => {
    it("devolve os 5 cards na ordem do design (tensão, corrente, potência, fator de potência, THD)", () => {
        const cards = buildElectricalQuantityCards(FULL_READING)
        expect(cards.map((c) => c.key)).toEqual([
            "voltage",
            "current",
            "power",
            "powerFactor",
            "thd",
        ])
    })

    describe("Tensão", () => {
        it("mostra as 3 fases, a média e o desequilíbrio calculado pelo backend", () => {
            const { rows } = findCard(buildElectricalQuantityCards(FULL_READING), "voltage")
            expect(findRow(rows, "Fase A").value).toBe("219,00V")
            expect(findRow(rows, "Fase B").value).toBe("221,00V")
            expect(findRow(rows, "Fase C").value).toBe("220,00V")
            expect(findRow(rows, "Fase-neutro média").value).toBe("220,00V")
            expect(findRow(rows, "Desequilíbrio").value).toBe("0,45%")
        })

        it("RN34: fase ausente vira '-', e a média some por não poder ser calculada com dado parcial", () => {
            const reading = { ...FULL_READING, voltagePhaseB: undefined }
            const { rows } = findCard(buildElectricalQuantityCards(reading), "voltage")
            expect(findRow(rows, "Fase B").value).toBe("-")
            expect(findRow(rows, "Fase-neutro média").value).toBe("-")
        })
    })

    describe("Corrente", () => {
        it("mostra as 3 fases e a média; neutro é sempre '-' (RN34 — não medido nem derivável)", () => {
            const { rows } = findCard(buildElectricalQuantityCards(FULL_READING), "current")
            expect(findRow(rows, "Fase A").value).toBe("9,80A")
            expect(findRow(rows, "Neutro").value).toBe("-")
            expect(findRow(rows, "Média").value).toBe("9,93A")
        })

        it("neutro continua '-' mesmo com as 3 fases presentes", () => {
            const { rows } = findCard(buildElectricalQuantityCards(FULL_READING), "current")
            expect(findRow(rows, "Neutro").value).toBe("-")
        })
    })

    describe("Potência", () => {
        it("hero é a soma das 3 fases ativas; linhas trazem reativa/aparente/fases/frequência", () => {
            const { hero, rows } = findCard(buildElectricalQuantityCards(FULL_READING), "power")
            expect(hero).toEqual({ label: "Ativa total (3 fases)", value: "2,17kW" })
            expect(findRow(rows, "Reativa").value).toBe("0,94kvar")
            expect(findRow(rows, "Aparente").value).toBe("2,35kVA")
            expect(findRow(rows, "Ativa · fase A").value).toBe("0,70kW")
            expect(findRow(rows, "Frequência").value).toBe("59,98Hz")
        })

        it("RN34: uma fase ativa ausente derruba só o hero (soma), as outras fases continuam", () => {
            const reading = { ...FULL_READING, activePowerPhaseC: undefined }
            const { hero, rows } = findCard(buildElectricalQuantityCards(reading), "power")
            expect(hero?.value).toBe("-")
            expect(findRow(rows, "Ativa · fase A").value).toBe("0,70kW")
            expect(findRow(rows, "Ativa · fase C").value).toBe("-")
        })
    })

    describe("Fator de potência", () => {
        it("hero é a média das 3 fases; linhas trazem cada fase", () => {
            const { hero, rows } = findCard(
                buildElectricalQuantityCards(FULL_READING),
                "powerFactor",
            )
            expect(hero?.label).toBe("Média")
            expect(hero?.value).toBe("0,95")
            expect(findRow(rows, "Fase A").value).toBe("0,95")
            expect(findRow(rows, "Fase C").value).toBe("0,96")
        })
    })

    describe("Distorção harmônica (THD)", () => {
        it("mostra THD de tensão e corrente por fase", () => {
            const { rows } = findCard(buildElectricalQuantityCards(FULL_READING), "thd")
            expect(findRow(rows, "THD tensão · fase A").value).toBe("2,60%")
            expect(findRow(rows, "THD corrente · fase C").value).toBe("5,90%")
        })

        it("RN34: THD ausente vira '-'", () => {
            const reading = { ...FULL_READING, thdCurrentPhaseB: undefined }
            const { rows } = findCard(buildElectricalQuantityCards(reading), "thd")
            expect(findRow(rows, "THD corrente · fase B").value).toBe("-")
        })
    })

    it("medidor que não mede nenhuma grandeza por fase: todo card cai em '-', nunca 0", () => {
        const bareReading: ReadingPayload = {
            meterId: "meter-1",
            voltage: 220,
            current: 10,
            powerW: 2200,
            powerFactor: 0.95,
            receivedAt: "2026-01-01T00:00:00.000Z",
        }
        const cards = buildElectricalQuantityCards(bareReading)
        for (const card of cards) {
            if (card.hero) expect(card.hero.value).toBe("-")
            for (const row of card.rows) {
                expect(row.value).toBe("-")
            }
        }
    })
})
