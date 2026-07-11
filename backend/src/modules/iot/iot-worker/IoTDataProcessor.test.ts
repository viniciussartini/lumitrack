import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

// Acessa o método privado `process` via cast — mesmo padrão usado nos testes
// do worker antigo, necessário porque o processor só expõe `start()`
// publicamente (que é acoplado ao manager real).
function callProcess(processor: IoTDataProcessor, meterId: string, rawData: Record<string, unknown>): void {
    ;(processor as unknown as { process: (id: string, data: Record<string, unknown>) => void }).process(meterId, rawData)
}

describe("IoTDataProcessor", () => {
    let processor: IoTDataProcessor

    beforeEach(() => {
        vi.useFakeTimers()
        processor = new IoTDataProcessor(IoTConnectionManager.getInstance())
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe("validação de payload", () => {
        it("descarta payload com voltage negativo", () => {
            callProcess(processor, "meter-1", { voltage: -1, current: 1, powerW: 100, powerFactor: 0.9 })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com powerFactor fora de [0,1]", () => {
            callProcess(processor, "meter-1", { voltage: 220, current: 1, powerW: 100, powerFactor: 1.5 })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com campo não numérico", () => {
            callProcess(processor, "meter-1", { voltage: "220", current: 1, powerW: 100, powerFactor: 0.9 })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com NaN/Infinity", () => {
            callProcess(processor, "meter-1", { voltage: NaN, current: 1, powerW: 100, powerFactor: 0.9 })
            callProcess(processor, "meter-1", { voltage: Infinity, current: 1, powerW: 100, powerFactor: 0.9 })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("aceita payload válido e atualiza latest", () => {
            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 })
            expect(processor.buffer.getLatest("meter-1")).not.toBeNull()
        })
    })

    describe("cálculo de energia", () => {
        it("primeira amostra de um medidor não acumula energia (só inicializa o relógio)", () => {
            const now = new Date("2026-01-15T14:37:00.000Z")
            vi.setSystemTime(now)

            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 3600, powerFactor: 1 })

            const snapshots = processor.buffer.drainAll()
            expect(snapshots).toHaveLength(1)
            expect(snapshots[0]!.energyKwh).toBe(0)
        })

        it("calcula kWh = powerW × Δt / 3.6e6 para a segunda amostra em diante", () => {
            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 3600, powerFactor: 1 })

            // 1 segundo depois, potência constante de 3600W → 3600 * 1 / 3.6e6 = 0.001 kWh
            vi.setSystemTime(new Date("2026-01-15T14:37:01.000Z"))
            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 3600, powerFactor: 1 })

            const snapshots = processor.buffer.drainAll()
            const total = snapshots.reduce((sum, s) => sum + s.energyKwh, 0)
            expect(total).toBeCloseTo(0.001)
        })

        it("faz clamp do Δt em 5s quando o gap entre amostras é maior", () => {
            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 3600, powerFactor: 1 })

            // Gap de 60s (medidor "silencioso") — Δt deve ser limitado a 5s, não 60s.
            vi.setSystemTime(new Date("2026-01-15T14:38:00.000Z"))
            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 3600, powerFactor: 1 })

            const snapshots = processor.buffer.drainAll()
            const total = snapshots.reduce((sum, s) => sum + s.energyKwh, 0)
            // 3600W * 5s / 3.6e6 = 0.005 kWh (não 0.06, que seria sem o clamp)
            expect(total).toBeCloseTo(0.005)
        })

        it("timestamp oficial é o momento de recebimento, não deviceTimestamp", () => {
            const now = new Date("2026-01-15T14:37:00.000Z")
            vi.setSystemTime(now)

            let received: Date | undefined
            processor.addSampleListener((sample) => { received = sample.receivedAt })

            callProcess(processor, "meter-1", {
                voltage: 220, current: 2, powerW: 440, powerFactor: 0.95,
                deviceTimestamp: "2020-01-01T00:00:00.000Z", // deliberadamente muito diferente
            })

            expect(received).toEqual(now)
        })
    })

    describe("listeners", () => {
        it("notifica listeners registrados com a amostra processada", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0]![0]).toMatchObject({
                meterId: "meter-1", voltage: 220, current: 2, powerW: 440, powerFactor: 0.95,
            })
        })

        it("remove o listener ao chamar a função de unsubscribe", () => {
            const listener = vi.fn()
            const unsubscribe = processor.addSampleListener(listener)
            unsubscribe()

            callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 })

            expect(listener).not.toHaveBeenCalled()
        })

        it("um listener que lança erro não impede os demais de serem chamados", () => {
            const broken = vi.fn(() => { throw new Error("boom") })
            const ok = vi.fn()
            processor.addSampleListener(broken)
            processor.addSampleListener(ok)

            expect(() => {
                callProcess(processor, "meter-1", { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 })
            }).not.toThrow()

            expect(ok).toHaveBeenCalledTimes(1)
        })
    })
})
