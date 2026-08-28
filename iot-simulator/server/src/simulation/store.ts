import { randomUUID } from "crypto"
import { EventEmitter } from "events"
import type {
    AnomalyState,
    DeviceParams,
    ElectricalSample,
    NetworkSnapshot,
    VirtualDevice,
    VirtualNetwork,
} from "@/simulation/types.js"
import { DEFAULT_ANOMALY_STATE, DEFAULT_DEVICE_PARAMS } from "@/simulation/types.js"

export type ChangeReason =
    | "network-created"
    | "network-deleted"
    | "device-created"
    | "device-updated"
    | "device-deleted"
    | "device-power"
    | "device-anomaly"
    | "device-sample"

export interface ChangeEvent {
    reason: ChangeReason
    networkId?: string
    deviceId?: string
}

// `| undefined` explícito em cada campo (não só `?:`) porque o input real
// vem de zod.parse() de um body JSON — com exactOptionalPropertyTypes,
// `?:` sozinho não aceita a chave presente com valor `undefined`, que é
// exatamente o que `z.object({...}).partial()` infere para campos opcionais.
type PartialDeviceParams = { [K in keyof DeviceParams]?: DeviceParams[K] | undefined }

export interface NewDeviceInput {
    name: string
    topic: string
    params?: PartialDeviceParams | undefined
}

export interface UpdateDeviceInput {
    name?: string | undefined
    topic?: string | undefined
    params?: PartialDeviceParams | undefined
}

// Mescla só as chaves realmente presentes em `patch` (JSON nunca envia uma
// chave "presente com valor undefined" — só ausente ou com um valor real).
// Necessário porque exactOptionalPropertyTypes impede um spread ingênuo de
// `PartialDeviceParams` sobre `DeviceParams` (o compilador não sabe que os
// valores `| undefined` do tipo nunca ocorrem de fato aqui).
function mergeDefined<T extends object>(
    base: T,
    patch: { [K in keyof T]?: T[K] | undefined } | undefined,
): T {
    const result = { ...base }
    if (!patch) return result
    for (const key of Object.keys(patch) as (keyof T)[]) {
        const value = patch[key]
        if (value !== undefined) result[key] = value
    }
    return result
}

/**
 * Estado em memória do simulador. Reiniciar o servidor zera tudo —
 * aceitável (ferramenta de dev, sem estado que precise sobreviver a um
 * restart). Emite `"changed"` a cada mutação, para os consumidores SSE.
 */
export class SimulationStore extends EventEmitter {
    private readonly networks = new Map<string, VirtualNetwork>()
    // Índice reverso: as rotas /api/devices/:id não recebem networkId no
    // path, então precisamos localizar a rede dona de um device em O(1).
    private readonly deviceIndex = new Map<string, string>()

    private emitChanged(event: ChangeEvent): void {
        this.emit("changed", event)
    }

    /**
     * @param name Nome da rede.
     * @returns A rede criada, vazia.
     */
    createNetwork(name: string): VirtualNetwork {
        const network: VirtualNetwork = { id: randomUUID(), name, devices: new Map() }
        this.networks.set(network.id, network)
        this.emitChanged({ reason: "network-created", networkId: network.id })
        return network
    }

    /**
     * Remove a rede e todos os seus devices (e seus registros no índice
     * reverso).
     *
     * @param id Id da rede a remover.
     * @returns `true` se a rede existia e foi removida.
     */
    deleteNetwork(id: string): boolean {
        const network = this.networks.get(id)
        if (!network) return false

        for (const deviceId of network.devices.keys()) {
            this.deviceIndex.delete(deviceId)
        }
        this.networks.delete(id)
        this.emitChanged({ reason: "network-deleted", networkId: id })
        return true
    }

    /** @returns Todas as redes cadastradas. */
    listNetworks(): VirtualNetwork[] {
        return [...this.networks.values()]
    }

    /**
     * @param id Id da rede.
     * @returns A rede, ou `undefined` se não existir.
     */
    getNetwork(id: string): VirtualNetwork | undefined {
        return this.networks.get(id)
    }

    /** @returns Todas as redes com seus devices, em formato de resposta de API. */
    snapshot(): NetworkSnapshot[] {
        return this.listNetworks().map((network) => ({
            id: network.id,
            name: network.name,
            devices: [...network.devices.values()],
        }))
    }

    /**
     * Cria um device desligado numa rede existente.
     *
     * @param networkId Id da rede dona do device.
     * @param input Nome, tópico e params (mesclados sobre os defaults).
     * @returns O device criado, ou `undefined` se a rede não existir.
     */
    createDevice(networkId: string, input: NewDeviceInput): VirtualDevice | undefined {
        const network = this.networks.get(networkId)
        if (!network) return undefined

        const device: VirtualDevice = {
            id: randomUUID(),
            networkId,
            name: input.name,
            topic: input.topic,
            poweredOn: false,
            params: mergeDefined(DEFAULT_DEVICE_PARAMS, input.params),
            anomaly: { ...DEFAULT_ANOMALY_STATE },
            lastSample: null,
            lastPublishedAt: null,
            publishCount: 0,
            connected: false,
        }

        network.devices.set(device.id, device)
        this.deviceIndex.set(device.id, networkId)
        this.emitChanged({ reason: "device-created", networkId, deviceId: device.id })
        return device
    }

    /**
     * @param deviceId Id do device.
     * @returns O device, ou `undefined` se não existir (usa o índice reverso).
     */
    getDevice(deviceId: string): VirtualDevice | undefined {
        const networkId = this.deviceIndex.get(deviceId)
        if (!networkId) return undefined
        return this.networks.get(networkId)?.devices.get(deviceId)
    }

    /**
     * Atualiza só os campos presentes em `patch` — os demais ficam intactos.
     *
     * @param deviceId Id do device a atualizar.
     * @param patch Campos a mudar (nome/tópico/params, parcial).
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    updateDevice(deviceId: string, patch: UpdateDeviceInput): VirtualDevice | undefined {
        const device = this.getDevice(deviceId)
        if (!device) return undefined

        if (patch.name !== undefined) device.name = patch.name
        if (patch.topic !== undefined) device.topic = patch.topic
        if (patch.params !== undefined) device.params = mergeDefined(device.params, patch.params)

        this.emitChanged({ reason: "device-updated", networkId: device.networkId, deviceId })
        return device
    }

    /**
     * @param deviceId Id do device a remover.
     * @returns `true` se o device existia e foi removido.
     */
    deleteDevice(deviceId: string): boolean {
        const networkId = this.deviceIndex.get(deviceId)
        if (!networkId) return false

        this.networks.get(networkId)?.devices.delete(deviceId)
        this.deviceIndex.delete(deviceId)
        this.emitChanged({ reason: "device-deleted", networkId, deviceId })
        return true
    }

    /**
     * Liga ou desliga um device (não inicia/para o `DeviceRunner` — isso é
     * responsabilidade de `SimulationEngine`).
     *
     * @param deviceId Id do device.
     * @param on `true` para ligar, `false` para desligar.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    setPower(deviceId: string, on: boolean): VirtualDevice | undefined {
        const device = this.getDevice(deviceId)
        if (!device) return undefined

        device.poweredOn = on
        this.emitChanged({ reason: "device-power", networkId: device.networkId, deviceId })
        return device
    }

    /**
     * @param deviceId Id do device.
     * @param anomaly Novo estado de anomalia.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    setAnomaly(deviceId: string, anomaly: AnomalyState): VirtualDevice | undefined {
        const device = this.getDevice(deviceId)
        if (!device) return undefined

        device.anomaly = anomaly
        this.emitChanged({ reason: "device-anomaly", networkId: device.networkId, deviceId })
        return device
    }

    /**
     * @param deviceId Id do device.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    clearAnomaly(deviceId: string): VirtualDevice | undefined {
        return this.setAnomaly(deviceId, { ...DEFAULT_ANOMALY_STATE })
    }

    /**
     * Registra a leitura mais recente de um device (`DeviceRunner` chama a
     * cada tick publicado).
     *
     * @param deviceId Id do device.
     * @param sample Amostra elétrica gerada.
     * @param publishedAtMs Timestamp (epoch ms) da publicação.
     */
    recordSample(deviceId: string, sample: ElectricalSample, publishedAtMs: number): void {
        const device = this.getDevice(deviceId)
        if (!device) return

        device.lastSample = sample
        device.lastPublishedAt = publishedAtMs
        device.publishCount += 1
        device.connected = true
        this.emitChanged({ reason: "device-sample", networkId: device.networkId, deviceId })
    }
}
