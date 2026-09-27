import type { AnomalyState, DeviceParams, ElectricalSample } from "@/simulation/types.js"

/**
 * Amostra de ruído gaussiano via Box-Muller (transformação polar simples),
 * sem dependência externa.
 *
 * @param stdDev Desvio padrão do ruído.
 * @param mean Média do ruído (default 0).
 * @returns Uma amostra aleatória da distribuição normal(mean, stdDev).
 */
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

// Grandezas por fase (ADR-0022) — cada fase recebe ruído gaussiano próprio
// em torno do valor agregado, produzindo um pequeno desequilíbrio natural
// entre A/B/C (tipicamente dentro de ±3–5% de diferença entre as três) sem
// nenhum estado compartilhado entre elas.
const PHASE_VOLTAGE_UNBALANCE_STD_DEV_FRACTION = 0.015
const PHASE_ACTIVE_POWER_UNBALANCE_STD_DEV_FRACTION = 0.02
const PHASE_POWER_FACTOR_NOISE_STD_DEV = 0.005

const FREQUENCY_BASE_HZ = 60
const FREQUENCY_JITTER_STD_DEV_HZ = 0.05

// Faixas de THD plausíveis para uma instalação residencial/comercial —
// corrente distorce mais que tensão porque cargas não-lineares (fontes
// chaveadas, inversores) injetam harmônicos na corrente que a rede absorve
// sem repassar na mesma proporção à tensão.
const THD_VOLTAGE_BASE_PERCENT = 2
const THD_VOLTAGE_NOISE_STD_DEV_PERCENT = 0.4
const THD_CURRENT_BASE_PERCENT = 5
const THD_CURRENT_NOISE_STD_DEV_PERCENT = 1

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

function clampTriplet(values: [number, number, number], min: number): [number, number, number] {
    return values.map((v) => Math.max(min, v)) as [number, number, number]
}

function gaussianTriplet(base: number, stdDev: number): [number, number, number] {
    return [
        base + gaussianNoise(stdDev),
        base + gaussianNoise(stdDev),
        base + gaussianNoise(stdDev),
    ]
}

interface AggregateSample {
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    apparentPowerVa: number
    reactivePowerVar: number
    frequencyHz: number
}

/**
 * Gera as grandezas agregadas (não separadas por fase) de um tick: as 4 já
 * existentes antes do ADR-0022, mais potência aparente/reativa (derivadas de
 * P e do fator de potência pela relação S² = P² + Q², em vez de amostradas
 * de forma independente — assim as três nunca ficam fisicamente
 * inconsistentes entre si) e a frequência.
 *
 * @param params Parâmetros nominais do device.
 * @param anomaly Estado de anomalia ativa.
 * @param tickIndex Índice do tick atual.
 * @returns As grandezas agregadas do tick.
 */
function generateAggregate(
    params: DeviceParams,
    anomaly: AnomalyState,
    tickIndex: number,
): AggregateSample {
    const wave =
        Math.sin((tickIndex / SIGNAL_PERIOD_TICKS) * 2 * Math.PI) * SIGNAL_AMPLITUDE_FRACTION
    const anomalyMultiplier = anomaly.active ? anomaly.multiplier : 1

    const targetPowerW = params.nominalPowerW * (1 + wave) * anomalyMultiplier
    const powerNoise = gaussianNoise(params.nominalPowerW * (params.noiseAmplitudePercent / 100))
    const powerW = Math.max(0, targetPowerW + powerNoise)

    const voltageSag = anomaly.active ? 1 - ANOMALY_VOLTAGE_SAG_FRACTION : 1
    const voltage = Math.max(
        MIN_VOLTAGE,
        params.nominalVoltage * voltageSag + gaussianNoise(params.nominalVoltage * 0.005),
    )

    const powerFactor = Math.min(
        1,
        Math.max(MIN_POWER_FACTOR, params.powerFactorBase + gaussianNoise(0.01)),
    )
    const current = powerW / (voltage * powerFactor)
    const apparentPowerVa = powerW / powerFactor
    const reactivePowerVar = Math.sqrt(Math.max(0, apparentPowerVa ** 2 - powerW ** 2))
    const frequencyHz = FREQUENCY_BASE_HZ + gaussianNoise(FREQUENCY_JITTER_STD_DEV_HZ)

    return { voltage, current, powerW, powerFactor, apparentPowerVa, reactivePowerVar, frequencyHz }
}

interface PhaseTriplets {
    voltage: [number, number, number]
    current: [number, number, number]
    activePower: [number, number, number]
    powerFactor: [number, number, number]
    thdVoltage: [number, number, number]
    thdCurrent: [number, number, number]
}

/**
 * Deriva as grandezas por fase a partir dos valores agregados do tick.
 * Corrente por fase é recalculada de volta de P = V·I·PF (mesma relação já
 * usada na grandeza agregada), garantindo coerência física entre as três —
 * amostrar a corrente de forma independente permitiria uma fase com
 * potência alta e corrente baixa ao mesmo tempo, o que não existe na
 * prática.
 *
 * @param voltage Tensão agregada do tick.
 * @param powerW Potência ativa agregada do tick.
 * @param powerFactor Fator de potência agregado do tick.
 * @returns As grandezas de cada fase (A, B, C).
 */
function generatePhaseTriplets(
    voltage: number,
    powerW: number,
    powerFactor: number,
): PhaseTriplets {
    const voltagePhases = clampTriplet(
        gaussianTriplet(voltage, voltage * PHASE_VOLTAGE_UNBALANCE_STD_DEV_FRACTION),
        MIN_VOLTAGE,
    )
    const activePowerPhases = clampTriplet(
        gaussianTriplet(powerW / 3, (powerW / 3) * PHASE_ACTIVE_POWER_UNBALANCE_STD_DEV_FRACTION),
        0,
    )
    const powerFactorPhases = clampTriplet(
        gaussianTriplet(powerFactor, PHASE_POWER_FACTOR_NOISE_STD_DEV),
        MIN_POWER_FACTOR,
    ).map((pf) => Math.min(1, pf)) as [number, number, number]
    const thdVoltagePhases = clampTriplet(
        gaussianTriplet(THD_VOLTAGE_BASE_PERCENT, THD_VOLTAGE_NOISE_STD_DEV_PERCENT),
        0,
    )
    const thdCurrentPhases = clampTriplet(
        gaussianTriplet(THD_CURRENT_BASE_PERCENT, THD_CURRENT_NOISE_STD_DEV_PERCENT),
        0,
    )

    const [voltageA, voltageB, voltageC] = voltagePhases
    const [powerA, powerB, powerC] = activePowerPhases
    const [pfA, pfB, pfC] = powerFactorPhases
    const currentPhases: [number, number, number] = [
        powerA / (voltageA * pfA),
        powerB / (voltageB * pfB),
        powerC / (voltageC * pfC),
    ]

    return {
        voltage: voltagePhases,
        current: currentPhases,
        activePower: activePowerPhases,
        powerFactor: powerFactorPhases,
        thdVoltage: thdVoltagePhases,
        thdCurrent: thdCurrentPhases,
    }
}

/**
 * Gera uma amostra elétrica sintética para um tick: senoide de período
 * longo + ruído gaussiano por grandeza, com clamps mínimos de tensão e
 * fator de potência para nunca produzir corrente `Infinity`/`NaN`. Inclui as
 * grandezas por fase do ADR-0022 — um dispositivo simulado sempre reporta o
 * conjunto completo (ao contrário de um medidor real, que pode não medir
 * todas), já que o objetivo aqui é validar o pipeline e a UI de ponta a
 * ponta.
 *
 * @param params Parâmetros nominais do device (tensão, potência, ruído).
 * @param anomaly Estado de anomalia ativa (multiplica potência, afunda tensão).
 * @param tickIndex Índice do tick atual — alimenta a fase da senoide.
 * @returns A amostra completa, agregada e por fase.
 */
export function generateSample(
    params: DeviceParams,
    anomaly: AnomalyState,
    tickIndex: number,
): ElectricalSample {
    const aggregate = generateAggregate(params, anomaly, tickIndex)
    const phases = generatePhaseTriplets(aggregate.voltage, aggregate.powerW, aggregate.powerFactor)

    return {
        voltage: round(aggregate.voltage, 2),
        current: round(aggregate.current, 2),
        powerW: round(aggregate.powerW, 2),
        powerFactor: round(aggregate.powerFactor, 3),
        voltagePhaseA: round(phases.voltage[0], 2),
        voltagePhaseB: round(phases.voltage[1], 2),
        voltagePhaseC: round(phases.voltage[2], 2),
        currentPhaseA: round(phases.current[0], 2),
        currentPhaseB: round(phases.current[1], 2),
        currentPhaseC: round(phases.current[2], 2),
        activePowerPhaseA: round(phases.activePower[0], 2),
        activePowerPhaseB: round(phases.activePower[1], 2),
        activePowerPhaseC: round(phases.activePower[2], 2),
        reactivePowerVar: round(aggregate.reactivePowerVar, 2),
        apparentPowerVa: round(aggregate.apparentPowerVa, 2),
        frequencyHz: round(aggregate.frequencyHz, 3),
        powerFactorPhaseA: round(phases.powerFactor[0], 3),
        powerFactorPhaseB: round(phases.powerFactor[1], 3),
        powerFactorPhaseC: round(phases.powerFactor[2], 3),
        thdVoltagePhaseA: round(phases.thdVoltage[0], 2),
        thdVoltagePhaseB: round(phases.thdVoltage[1], 2),
        thdVoltagePhaseC: round(phases.thdVoltage[2], 2),
        thdCurrentPhaseA: round(phases.thdCurrent[0], 2),
        thdCurrentPhaseB: round(phases.thdCurrent[1], 2),
        thdCurrentPhaseC: round(phases.thdCurrent[2], 2),
    }
}
