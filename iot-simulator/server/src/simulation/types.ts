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
    endsAt: number | null // epoch ms
}

// As grandezas por fase do ADR-0022, exceto desequilíbrio de tensão — essa é
// sempre calculada pelo backend a partir das 3 fases da amostra
// (`IoTDataProcessor`), nunca publicada pelo medidor (real ou simulado). Um
// dispositivo simulado sempre reporta as 21 grandezas (`generateSample`
// nunca omite nenhuma) — ao contrário de um medidor real, que pode não medir
// todas.
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

export interface VirtualNetwork {
    id: string
    name: string
    devices: Map<string, VirtualDevice>
}

// DTO serializável — `Map` não vira JSON, então a API REST/SSE trafega
// snapshots neste formato em vez de `VirtualNetwork` diretamente.
export interface NetworkSnapshot {
    id: string
    name: string
    devices: VirtualDevice[]
}

export const DEFAULT_DEVICE_PARAMS: DeviceParams = {
    nominalVoltage: 220,
    nominalPowerW: 1000,
    powerFactorBase: 0.95,
    noiseAmplitudePercent: 1,
    profile: "RESIDENTIAL_STEADY",
}

export const DEFAULT_ANOMALY_STATE: AnomalyState = {
    active: false,
    multiplier: 1,
    endsAt: null,
}
