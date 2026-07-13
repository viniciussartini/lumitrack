import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

function createFakePublisher(): InternalPublisher & { publish: ReturnType<typeof vi.fn<(topic: string, payload: unknown) => void>> } {
    return {
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        publish: vi.fn<(topic: string, payload: unknown) => void>(),
        isConnected: () => true,
    }
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("SimulationEngine — anomalias", () => {
    it("triggerAnomaly seta endsAt corretamente e clearAnomaly desativa", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        const engine = new SimulationEngine(store, createFakePublisher())

        const now = Date.now()
        vi.setSystemTime(now)
        engine.triggerAnomaly(device.id, 3, 30)

        const updated = store.getDevice(device.id)!
        expect(updated.anomaly).toEqual({ active: true, multiplier: 3, endsAt: now + 30_000 })

        engine.clearAnomaly(device.id)
        expect(store.getDevice(device.id)?.anomaly.active).toBe(false)
    })

    it("avançar o tempo além da duração desativa a anomalia sozinha, sem chamada manual a clearAnomaly", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        const engine = new SimulationEngine(store, createFakePublisher())

        engine.startEngine()
        engine.triggerAnomaly(device.id, 3, 5) // 5s

        vi.advanceTimersByTime(4000)
        expect(store.getDevice(device.id)?.anomaly.active).toBe(true) // ainda não expirou

        vi.advanceTimersByTime(2000) // total 6s > 5s
        expect(store.getDevice(device.id)?.anomaly.active).toBe(false)

        engine.stopEngine()
    })
})

describe("SimulationEngine — power", () => {
    it("powerOn/powerOff controlam exatamente um DeviceRunner por device", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        const publisher = createFakePublisher()
        const engine = new SimulationEngine(store, publisher)

        engine.powerOn(device.id)
        engine.powerOn(device.id) // chamada dupla — não deve criar dois timers
        vi.advanceTimersByTime(2000)
        expect(publisher.publish).toHaveBeenCalledTimes(2)

        engine.powerOff(device.id)
        vi.advanceTimersByTime(3000)
        expect(publisher.publish).toHaveBeenCalledTimes(2) // nenhum tick novo após powerOff
        expect(store.getDevice(device.id)?.poweredOn).toBe(false)
    })

    it("powerOn/powerOff em device inexistente retornam undefined sem lançar", () => {
        const store = new SimulationStore()
        const engine = new SimulationEngine(store, createFakePublisher())
        expect(engine.powerOn("id-inexistente")).toBeUndefined()
        expect(engine.powerOff("id-inexistente")).toBeUndefined()
    })

    it("removeDevice para o runner mesmo sem powerOff prévio", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        const publisher = createFakePublisher()
        const engine = new SimulationEngine(store, publisher)

        engine.powerOn(device.id)
        vi.advanceTimersByTime(1000)
        expect(publisher.publish).toHaveBeenCalledTimes(1)

        engine.removeDevice(device.id)
        vi.advanceTimersByTime(3000)
        expect(publisher.publish).toHaveBeenCalledTimes(1) // nenhum tick novo
    })
})

describe("SimulationEngine — start/stop do engine", () => {
    it("stopEngine para todos os runners ativos", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const deviceA = store.createDevice(network.id, { name: "A", topic: "sim/a" })!
        const deviceB = store.createDevice(network.id, { name: "B", topic: "sim/b" })!
        const publisher = createFakePublisher()
        const engine = new SimulationEngine(store, publisher)

        engine.powerOn(deviceA.id)
        engine.powerOn(deviceB.id)
        engine.stopEngine()

        vi.advanceTimersByTime(3000)
        expect(publisher.publish).not.toHaveBeenCalled()
    })
})
