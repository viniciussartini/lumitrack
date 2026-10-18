import { describe, it, expect, vi } from "vitest"
import { gaussianNoise, generateSample } from "@/simulation/signalGenerator.js"
import type { AnomalyState, DeviceParams, ElectricalSample } from "@/simulation/types.js"

const baseParams: DeviceParams = {
    nominalVoltage: 220,
    nominalPowerW: 1000,
    powerFactorBase: 0.95,
    noiseAmplitudePercent: 2,
    profile: "RESIDENTIAL_STEADY",
}

const inactiveAnomaly: AnomalyState = { active: false, multiplier: 1, endsAt: null }

// Mesmo predicado de backend/src/modules/iot/iot-worker/IoTDataProcessor.ts
// (isValidPayload) — um sample que falhasse aqui seria descartado
// silenciosamente pelo backend real.
function isFiniteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0
}

function isValidPayload(sample: {
    voltage: number
    current: number
    powerW: number
    powerFactor: number
}): boolean {
    return (
        isFiniteNonNegative(sample.voltage) &&
        isFiniteNonNegative(sample.current) &&
        isFiniteNonNegative(sample.powerW) &&
        Number.isFinite(sample.powerFactor) &&
        sample.powerFactor >= 0 &&
        sample.powerFactor <= 1
    )
}

describe("gaussianNoise", () => {
    it("calcula o valor exato da fórmula de Box-Muller para uma sequência fixa de Math.random", () => {
        const values = [0.25, 0.75]
        let callIndex = 0
        vi.spyOn(Math, "random").mockImplementation(() => values[callIndex++]!)

        const result = gaussianNoise(2, 10)

        const expected = 10 + Math.sqrt(-2 * Math.log(0.25)) * Math.cos(2 * Math.PI * 0.75) * 2
        expect(result).toBeCloseTo(expected, 10)

        vi.restoreAllMocks()
    })
})

describe("generateSample", () => {
    it("gera 1000 amostras, todas válidas contra o predicado do IoTDataProcessor real", () => {
        for (let tick = 0; tick < 1000; tick++) {
            const sample = generateSample(baseParams, inactiveAnomaly, tick)
            expect(isValidPayload(sample)).toBe(true)
        }
    })

    it("mantém coerência física P ≈ V·I·PF (current foi derivado dessa equação, dentro do erro de arredondamento)", () => {
        const sample = generateSample(baseParams, inactiveAnomaly, 0)
        const computedPower = sample.voltage * sample.current * sample.powerFactor
        const relativeError = Math.abs(computedPower - sample.powerW) / sample.powerW
        expect(relativeError).toBeLessThan(0.005)
    })

    it("anomalia ativa eleva a potência média e reduz a tensão média comparado a anomalia inativa", () => {
        const activeAnomaly: AnomalyState = { active: true, multiplier: 3, endsAt: null }
        const ticks = 200

        let sumPowerInactive = 0
        let sumVoltageInactive = 0
        let sumPowerActive = 0
        let sumVoltageActive = 0

        for (let tick = 0; tick < ticks; tick++) {
            const inactiveSample = generateSample(baseParams, inactiveAnomaly, tick)
            sumPowerInactive += inactiveSample.powerW
            sumVoltageInactive += inactiveSample.voltage

            const activeSample = generateSample(baseParams, activeAnomaly, tick)
            sumPowerActive += activeSample.powerW
            sumVoltageActive += activeSample.voltage
        }

        expect(sumPowerActive / ticks).toBeGreaterThan((sumPowerInactive / ticks) * 2)
        expect(sumVoltageActive / ticks).toBeLessThan(sumVoltageInactive / ticks)
    })

    it("nunca gera current Infinity/NaN mesmo com noiseAmplitudePercent alto (clamps de voltage/powerFactor)", () => {
        const noisyParams: DeviceParams = { ...baseParams, noiseAmplitudePercent: 50 }
        for (let tick = 0; tick < 500; tick++) {
            const sample = generateSample(noisyParams, inactiveAnomaly, tick)
            expect(Number.isFinite(sample.current)).toBe(true)
        }
    })
})

// Mesmas faixas de plausibilidade de backend/src/modules/iot/iot-worker/
// IoTDataProcessor.ts (isValidOptionalFields) — uma grandeza que falhasse
// aqui seria descartada (a amostra inteira, não só o campo) pelo backend
// real.
const MAX_PLAUSIBLE_VOLTAGE = 500
const MAX_PLAUSIBLE_CURRENT = 2000
const MAX_PLAUSIBLE_POWER_W = 1_000_000
const MAX_PLAUSIBLE_THD_PERCENT = 100
const MIN_PLAUSIBLE_FREQUENCY_HZ = 45
const MAX_PLAUSIBLE_FREQUENCY_HZ = 65

function isFiniteInRange(value: number, max: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= max
}

function isValidPhaseFields(sample: ElectricalSample): boolean {
    const voltages = [sample.voltagePhaseA, sample.voltagePhaseB, sample.voltagePhaseC]
    const currents = [sample.currentPhaseA, sample.currentPhaseB, sample.currentPhaseC]
    const powers = [
        sample.activePowerPhaseA,
        sample.activePowerPhaseB,
        sample.activePowerPhaseC,
        sample.reactivePowerVar,
        sample.apparentPowerVa,
    ]
    const powerFactors = [
        sample.powerFactorPhaseA,
        sample.powerFactorPhaseB,
        sample.powerFactorPhaseC,
    ]
    const thds = [
        sample.thdVoltagePhaseA,
        sample.thdVoltagePhaseB,
        sample.thdVoltagePhaseC,
        sample.thdCurrentPhaseA,
        sample.thdCurrentPhaseB,
        sample.thdCurrentPhaseC,
    ]

    return (
        voltages.every((v) => isFiniteInRange(v, MAX_PLAUSIBLE_VOLTAGE)) &&
        currents.every((v) => isFiniteInRange(v, MAX_PLAUSIBLE_CURRENT)) &&
        powers.every((v) => isFiniteInRange(v, MAX_PLAUSIBLE_POWER_W)) &&
        powerFactors.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
        thds.every((v) => isFiniteInRange(v, MAX_PLAUSIBLE_THD_PERCENT)) &&
        Number.isFinite(sample.frequencyHz) &&
        sample.frequencyHz >= MIN_PLAUSIBLE_FREQUENCY_HZ &&
        sample.frequencyHz <= MAX_PLAUSIBLE_FREQUENCY_HZ
    )
}

describe("generateSample — grandezas por fase (ADR-0022)", () => {
    it("gera 1000 amostras, todas com as 21 grandezas por fase válidas contra as faixas do IoTDataProcessor real", () => {
        for (let tick = 0; tick < 1000; tick++) {
            const sample = generateSample(baseParams, inactiveAnomaly, tick)
            expect(isValidPhaseFields(sample)).toBe(true)
        }
    })

    it("nunca gera NaN/Infinity nas grandezas por fase mesmo com noiseAmplitudePercent alto", () => {
        const noisyParams: DeviceParams = { ...baseParams, noiseAmplitudePercent: 50 }
        for (let tick = 0; tick < 500; tick++) {
            const sample = generateSample(noisyParams, inactiveAnomaly, tick)
            expect(Object.values(sample).every((value) => Number.isFinite(value as number))).toBe(
                true,
            )
        }
    })

    it("mantém coerência física S² = P² + Q² entre potência ativa, reativa e aparente", () => {
        const sample = generateSample(baseParams, inactiveAnomaly, 0)
        const computedApparent = Math.sqrt(sample.powerW ** 2 + sample.reactivePowerVar ** 2)
        const relativeError =
            Math.abs(computedApparent - sample.apparentPowerVa) / sample.apparentPowerVa
        expect(relativeError).toBeLessThan(0.005)
    })

    it("a soma da potência ativa por fase bate com powerW agregado (a menos do arredondamento de exibição)", () => {
        for (let tick = 0; tick < 200; tick++) {
            const sample = generateSample(baseParams, inactiveAnomaly, tick)
            const sumPhases =
                sample.activePowerPhaseA + sample.activePowerPhaseB + sample.activePowerPhaseC
            // O card "Ativa total (3 fases)" (frontend) soma as 3 fases; se
            // divergir de `powerW`, o mesmo tick mostraria potências
            // diferentes entre a aba de grandezas e o KPI "Potência agora".
            // Tolerância cobre só o arredondamento de exibição (`round(x,2)`
            // aplicado independentemente às 3 fases e ao agregado, até
            // ±0,005 cada) — a soma dos valores NÃO arredondados é exata.
            expect(Math.abs(sumPhases - sample.powerW)).toBeLessThan(0.02)
        }
    })

    it("desequilíbrio entre fases fica dentro de uma margem plausível (não diverge)", () => {
        for (let tick = 0; tick < 200; tick++) {
            const sample = generateSample(baseParams, inactiveAnomaly, tick)
            const voltages = [sample.voltagePhaseA, sample.voltagePhaseB, sample.voltagePhaseC]
            const average = voltages.reduce((sum, v) => sum + v, 0) / 3
            const maxDeviationFraction =
                Math.max(...voltages.map((v) => Math.abs(v - average))) / average

            // Desvio padrão configurado é de 1,5% — folga generosa (10%) para
            // não tornar o teste instável por causa de uma cauda estatística
            // rara, mas ainda capaz de pegar uma fórmula quebrada (ex.: um
            // desequilíbrio que crescesse sem limite).
            expect(maxDeviationFraction).toBeLessThan(0.1)
        }
    })

    it("frequência fica sempre próxima de 60Hz (jitter pequeno, não uma anomalia de rede)", () => {
        for (let tick = 0; tick < 200; tick++) {
            const sample = generateSample(baseParams, inactiveAnomaly, tick)
            expect(sample.frequencyHz).toBeGreaterThan(59.5)
            expect(sample.frequencyHz).toBeLessThan(60.5)
        }
    })
})
