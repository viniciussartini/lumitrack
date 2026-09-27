// Espelha iot-simulator/server/src/simulation/types.ts — os dois projetos
// não compartilham imports (apps genuinamente separados), então os tipos
// são duplicados aqui deliberadamente.

export type DeviceProfile = "RESIDENTIAL_STEADY" | "COMMERCIAL_HVAC" | "INDUSTRIAL_MOTOR" | "CUSTOM"

export interface DeviceParams {
    nominalVoltage: number
    nominalPowerW: number
    powerFactorBase: number
    noiseAmplitudePercent: number
    profile: DeviceProfile
}

export interface AnomalyState {
    active: boolean
    multiplier: number
    endsAt: number | null
}

// As grandezas por fase do ADR-0022, exceto desequilíbrio de tensão — essa é
// sempre calculada pelo backend, nunca publicada pelo medidor (real ou
// simulado). O simulador sempre reporta as 21 grandezas — ao contrário de um
// medidor real, que pode não medir todas.
export interface ElectricalSample {
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    voltagePhaseA: number
    voltagePhaseB: number
    voltagePhaseC: number
    currentPhaseA: number
    currentPhaseB: number
    currentPhaseC: number
    activePowerPhaseA: number
    activePowerPhaseB: number
    activePowerPhaseC: number
    reactivePowerVar: number
    apparentPowerVa: number
    frequencyHz: number
    powerFactorPhaseA: number
    powerFactorPhaseB: number
    powerFactorPhaseC: number
    thdVoltagePhaseA: number
    thdVoltagePhaseB: number
    thdVoltagePhaseC: number
    thdCurrentPhaseA: number
    thdCurrentPhaseB: number
    thdCurrentPhaseC: number
}

export interface VirtualDevice {
    id: string
    networkId: string
    name: string
    topic: string
    poweredOn: boolean
    params: DeviceParams
    anomaly: AnomalyState
    lastSample: ElectricalSample | null
    lastPublishedAt: number | null
    publishCount: number
    connected: boolean
}

export interface NetworkSnapshot {
    id: string
    name: string
    devices: VirtualDevice[]
}

export interface BrokerInfo {
    host: string
    port: number
}

export const DEVICE_PROFILES: DeviceProfile[] = [
    "RESIDENTIAL_STEADY",
    "COMMERCIAL_HVAC",
    "INDUSTRIAL_MOTOR",
    "CUSTOM",
]
