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
    noiseAmplitudePercent: 2,
    profile: "RESIDENTIAL_STEADY",
}

export const DEFAULT_ANOMALY_STATE: AnomalyState = {
    active: false,
    multiplier: 1,
    endsAt: null,
}
