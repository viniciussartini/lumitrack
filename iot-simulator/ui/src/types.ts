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

export interface ElectricalSample {
    voltage: number
    current: number
    powerW: number
    powerFactor: number
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
