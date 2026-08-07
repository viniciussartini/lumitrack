import { describe, it, expect, vi } from "vitest"
import { gaussianNoise, generateSample } from "@/simulation/signalGenerator.js"
import type { AnomalyState, DeviceParams } from "@/simulation/types.js"

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
