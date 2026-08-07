import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SimulationStore } from "@/simulation/store.js"
import { DeviceRunner } from "@/simulation/deviceRunner.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

function isFiniteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0
}

function createFakePublisher(): InternalPublisher & {
    publish: ReturnType<typeof vi.fn<(topic: string, payload: unknown) => void>>
} {
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

describe("DeviceRunner", () => {
    it("start() publica e grava uma amostra por segundo, com payload válido e o tópico correto", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        store.setPower(device.id, true)

        const publisher = createFakePublisher()
        const runner = new DeviceRunner(device.id, store, publisher)

        runner.start()
        vi.advanceTimersByTime(3000)

        expect(publisher.publish).toHaveBeenCalledTimes(3)
        const [topic, payload] = publisher.publish.mock.calls[0]! as [
            string,
            {
                voltage: number
                current: number
                powerW: number
                powerFactor: number
                deviceTimestamp: string
            },
        ]
        expect(topic).toBe("sim/dev1")
        expect(isFiniteNonNegative(payload.voltage)).toBe(true)
        expect(isFiniteNonNegative(payload.current)).toBe(true)
        expect(isFiniteNonNegative(payload.powerW)).toBe(true)
        expect(payload.powerFactor).toBeGreaterThanOrEqual(0)
        expect(payload.powerFactor).toBeLessThanOrEqual(1)
        expect(typeof payload.deviceTimestamp).toBe("string")

        expect(store.getDevice(device.id)?.publishCount).toBe(3)

        runner.stop()
    })

    it("stop() interrompe novos ticks", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        store.setPower(device.id, true)

        const publisher = createFakePublisher()
        const runner = new DeviceRunner(device.id, store, publisher)

        runner.start()
        vi.advanceTimersByTime(2000)
        runner.stop()
        vi.advanceTimersByTime(5000)

        expect(publisher.publish).toHaveBeenCalledTimes(2)
        expect(runner.isRunning()).toBe(false)
    })

    it("auto-stop defensivo: se o device for desligado externamente, o próximo tick para o runner sozinho", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        store.setPower(device.id, true)

        const publisher = createFakePublisher()
        const runner = new DeviceRunner(device.id, store, publisher)

        runner.start()
        vi.advanceTimersByTime(1000)
        expect(publisher.publish).toHaveBeenCalledTimes(1)

        store.setPower(device.id, false) // desligado "por fora", sem chamar runner.stop()
        vi.advanceTimersByTime(3000)

        expect(publisher.publish).toHaveBeenCalledTimes(1) // nenhum tick novo
        expect(runner.isRunning()).toBe(false)
    })

    it("start() chamado duas vezes seguidas não duplica o timer", () => {
        const store = new SimulationStore()
        const network = store.createNetwork("Casa Teste")
        const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!
        store.setPower(device.id, true)

        const publisher = createFakePublisher()
        const runner = new DeviceRunner(device.id, store, publisher)

        runner.start()
        runner.start()
        vi.advanceTimersByTime(1000)

        expect(publisher.publish).toHaveBeenCalledTimes(1)
        runner.stop()
    })
})
