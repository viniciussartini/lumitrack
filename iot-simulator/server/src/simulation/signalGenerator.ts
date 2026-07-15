import type { AnomalyState, DeviceParams, ElectricalSample } from "@/simulation/types.js"

// Box-Muller (transformação polar simples), sem dependência externa.
export function gaussianNoise(stdDev: number, mean = 0): number {
    const u1 = Math.random()
    const u2 = Math.random()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + z0 * stdDev
}

const SIGNAL_PERIOD_TICKS = 300 // ~5 min a 1 Hz — "senoide de período longo"
const SIGNAL_AMPLITUDE_FRACTION = 0.05
const ANOMALY_VOLTAGE_SAG_FRACTION = 0.03

// Clamps mínimos: sem eles, voltage/powerFactor podem chegar a 0 (ruído
// gaussiano ocasional), fazendo `current = powerW / (voltage * powerFactor)`
// virar Infinity/NaN — o backend real (IoTDataProcessor.isValidPayload)
// descartaria esse payload silenciosamente, com o sintoma confuso de
// "simulador rodando mas backend não recebe nada".
const MIN_VOLTAGE = 1
const MIN_POWER_FACTOR = 0.01

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

export function generateSample(params: DeviceParams, anomaly: AnomalyState, tickIndex: number): ElectricalSample {
    const wave = Math.sin((tickIndex / SIGNAL_PERIOD_TICKS) * 2 * Math.PI) * SIGNAL_AMPLITUDE_FRACTION
    const anomalyMultiplier = anomaly.active ? anomaly.multiplier : 1

    const targetPowerW = params.nominalPowerW * (1 + wave) * anomalyMultiplier
    const powerNoise = gaussianNoise(params.nominalPowerW * (params.noiseAmplitudePercent / 100))
    const powerW = Math.max(0, targetPowerW + powerNoise)

    const voltageSag = anomaly.active ? 1 - ANOMALY_VOLTAGE_SAG_FRACTION : 1
    const voltage = Math.max(
        MIN_VOLTAGE,
        params.nominalVoltage * voltageSag + gaussianNoise(params.nominalVoltage * 0.005),
    )

    const powerFactor = Math.min(1, Math.max(MIN_POWER_FACTOR, params.powerFactorBase + gaussianNoise(0.01)))

    const current = powerW / (voltage * powerFactor)

    return {
        voltage: round(voltage, 2),
        current: round(current, 2),
        powerW: round(powerW, 2),
        powerFactor: round(powerFactor, 3),
    }
}
