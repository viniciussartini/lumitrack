import { describe, it, expect, vi } from "vitest"
import { SimulationStore } from "@/simulation/store.js"
import type { ChangeEvent } from "@/simulation/store.js"

describe("SimulationStore — networks", () => {
    it("cria uma rede e a lista em listNetworks/snapshot", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")

        expect(store.listNetworks()).toEqual([network])
        expect(store.snapshot()).toEqual([{ id: network.id, name: "Casa Teste", devices: [] }])
    })

    it("deleteNetwork remove os devices dela do índice reverso", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!

        expect(store.deleteNetwork(network.id)).toBe(true)
        expect(store.getDevice(device.id)).toBeUndefined()
    })

    it("deleteNetwork em id inexistente retorna false sem lançar", () => {
        const store = new SimulationStore()
        expect(store.deleteNetwork("id-inexistente")).toBe(false)
    })
})

describe("SimulationStore — devices", () => {
    it("createDevice em rede inexistente retorna undefined", () => {
        const store = new SimulationStore()
        expect(store.createDevice("rede-inexistente", { name: "X", topic: "t" })).toBeUndefined()
    })

    it("createDevice aplica DEFAULT_DEVICE_PARAMS mesclado com o input", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, {
            name: "Medidor 1",
            topic: "sim/dev1",
            params: { nominalPowerW: 500 },
        })!

        expect(device.params.nominalPowerW).toBe(500)
        expect(device.params.nominalVoltage).toBe(220) // veio do default
        expect(device.poweredOn).toBe(false)
        expect(device.anomaly.active).toBe(false)
    })

    it("updateDevice/deleteDevice em id inexistente retornam undefined/false sem lançar", () => {
        const store = new SimulationStore()
        expect(store.updateDevice("id-inexistente", { name: "X" })).toBeUndefined()
        expect(store.deleteDevice("id-inexistente")).toBe(false)
    })

    it("updateDevice mescla params parcialmente", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!

        const updated = store.updateDevice(device.id, { params: { nominalVoltage: 380 } })!
        expect(updated.params.nominalVoltage).toBe(380)
        expect(updated.params.nominalPowerW).toBe(1000) // preservado do default
    })
})

describe("SimulationStore — power, anomaly, samples", () => {
    it("setPower/setAnomaly/recordSample atualizam o device certo e emitem 'changed'", async () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!

        const listener = vi.fn<(event: ChangeEvent) => void>()
        store.on("changed", listener)

        store.setPower(device.id, true)
        expect(store.getDevice(device.id)?.poweredOn).toBe(true)
        expect(listener).toHaveBeenCalledWith({
            reason: "device-power",
            networkId: network.id,
            deviceId: device.id,
        })

        store.setAnomaly(device.id, { active: true, multiplier: 3, endsAt: 12345 })
        expect(store.getDevice(device.id)?.anomaly).toEqual({
            active: true,
            multiplier: 3,
            endsAt: 12345,
        })
        expect(listener).toHaveBeenCalledWith({
            reason: "device-anomaly",
            networkId: network.id,
            deviceId: device.id,
        })

        store.clearAnomaly(device.id)
        expect(store.getDevice(device.id)?.anomaly.active).toBe(false)

        store.recordSample(
            device.id,
            { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 },
            1000,
        )
        const updated = store.getDevice(device.id)!
        expect(updated.lastSample).toEqual({
            voltage: 220,
            current: 2,
            powerW: 440,
            powerFactor: 0.95,
        })
        expect(updated.lastPublishedAt).toBe(1000)
        expect(updated.publishCount).toBe(1)
        expect(updated.connected).toBe(true)

        // recordSample() coalesce a notificação "changed" — o estado do
        // device já está atualizado sincronamente acima, mas o evento só
        // dispara depois de um setImmediate.
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(listener).toHaveBeenCalledWith({ reason: "device-sample" })
    })

    it("setPower/setAnomaly/recordSample em device inexistente não lançam", () => {
        const store = new SimulationStore()
        expect(store.setPower("id-inexistente", true)).toBeUndefined()
        expect(
            store.setAnomaly("id-inexistente", { active: true, multiplier: 2, endsAt: null }),
        ).toBeUndefined()
        expect(() =>
            store.recordSample(
                "id-inexistente",
                { voltage: 1, current: 1, powerW: 1, powerFactor: 1 },
                0,
            ),
        ).not.toThrow()
    })
})
