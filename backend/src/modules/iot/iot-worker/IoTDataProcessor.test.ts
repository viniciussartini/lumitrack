import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

// Acessa o método privado `process` via cast — mesmo padrão usado nos testes
// do worker antigo, necessário porque o processor só expõe `start()`
// publicamente (que é acoplado ao manager real).
function callProcess(
    processor: IoTDataProcessor,
    meterId: string,
    rawData: Record<string, unknown>,
): void {
    ;(
        processor as unknown as { process: (id: string, data: Record<string, unknown>) => void }
    ).process(meterId, rawData)
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
            callProcess(processor, "meter-1", {
                voltage: -1,
                current: 1,
                powerW: 100,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com powerFactor fora de [0,1]", () => {
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 1,
                powerW: 100,
                powerFactor: 1.5,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com campo não numérico", () => {
            callProcess(processor, "meter-1", {
                voltage: "220",
                current: 1,
                powerW: 100,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com voltage acima do teto de plausibilidade (500V) — valor implausível, não só negativo", () => {
            callProcess(processor, "meter-1", {
                voltage: 999999,
                current: 1,
                powerW: 100,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com current acima do teto de plausibilidade (2000A)", () => {
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 999999,
                powerW: 100,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com powerW acima do teto de plausibilidade (1 MW)", () => {
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 1,
                powerW: 999_999_999,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("descarta payload com NaN/Infinity", () => {
            callProcess(processor, "meter-1", {
                voltage: NaN,
                current: 1,
                powerW: 100,
                powerFactor: 0.9,
            })
            callProcess(processor, "meter-1", {
                voltage: Infinity,
                current: 1,
                powerW: 100,
                powerFactor: 0.9,
            })
            expect(processor.buffer.getLatest("meter-1")).toBeNull()
        })

        it("aceita payload válido e atualiza latest", () => {
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
            })
            expect(processor.buffer.getLatest("meter-1")).not.toBeNull()
        })
    })

    describe("grandezas por fase (ADR-0022)", () => {
        it("aceita payload sem nenhuma grandeza por fase (medidor que só reporta o básico)", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
            })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0]![0].voltagePhaseA).toBeUndefined()
        })

        it("repassa as grandezas por fase presentes ao listener, sem exigir todas", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                voltagePhaseA: 219,
                voltagePhaseB: 221,
                currentPhaseA: 1.9,
                frequencyHz: 60.02,
            })

            expect(listener.mock.calls[0]![0]).toMatchObject({
                voltagePhaseA: 219,
                voltagePhaseB: 221,
                currentPhaseA: 1.9,
                frequencyHz: 60.02,
            })
            // Só 2 das 3 fases de tensão vieram — sem a 3ª, o desequilíbrio
            // não é calculado, mesmo com as demais grandezas válidas.
            expect(listener.mock.calls[0]![0].voltageUnbalance).toBeUndefined()
        })

        it.each([
            ["voltagePhaseA", -1],
            ["voltagePhaseA", 999_999],
            ["currentPhaseB", -1],
            ["activePowerPhaseC", -1],
            ["reactivePowerVar", -1],
            ["apparentPowerVa", -1],
            ["powerFactorPhaseA", 1.5],
            ["powerFactorPhaseA", -0.1],
            ["thdVoltagePhaseB", -1],
            ["thdCurrentPhaseC", 150],
            ["frequencyHz", 44.9],
            ["frequencyHz", 65.1],
        ])(
            "descarta a amostra inteira quando %s = %d está fora da faixa plausível",
            (field, value) => {
                callProcess(processor, "meter-1", {
                    voltage: 220,
                    current: 2,
                    powerW: 440,
                    powerFactor: 0.95,
                    [field]: value,
                })

                expect(processor.buffer.getLatest("meter-1")).toBeNull()
            },
        )

        it("aceita frequência e THD nos limites plausíveis (45Hz, 65Hz, THD 100%)", () => {
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                frequencyHz: 45,
                thdVoltagePhaseA: 100,
            })
            expect(processor.buffer.getLatest("meter-1")).not.toBeNull()
        })

        it("calcula o desequilíbrio de tensão quando as 3 fases estão presentes", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            // Média = 220; maior desvio = |230-220| = 10 → 10/220*100 ≈ 4,545%
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                voltagePhaseA: 230,
                voltagePhaseB: 215,
                voltagePhaseC: 215,
            })

            expect(listener.mock.calls[0]![0].voltageUnbalance).toBeCloseTo((10 / 220) * 100)
        })

        it("não calcula desequilíbrio quando falta qualquer uma das 3 fases", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                voltagePhaseA: 230,
                voltagePhaseB: 215,
            })

            expect(listener.mock.calls[0]![0].voltageUnbalance).toBeUndefined()
        })
    })

    describe("cálculo de energia", () => {
        it("primeira amostra de um medidor não acumula energia (só inicializa o relógio)", () => {
            const now = new Date("2026-01-15T14:37:00.000Z")
            vi.setSystemTime(now)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            const snapshots = processor.buffer.drainAll()
            expect(snapshots).toHaveLength(1)
            expect(snapshots[0]!.energyKwh).toBe(0)
        })

        it("calcula kWh = powerW × Δt / 3.6e6 para a segunda amostra em diante", () => {
            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            // 1 segundo depois, potência constante de 3600W → 3600 * 1 / 3.6e6 = 0.001 kWh
            vi.setSystemTime(new Date("2026-01-15T14:37:01.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            const snapshots = processor.buffer.drainAll()
            const total = snapshots.reduce((sum, s) => sum + s.energyKwh, 0)
            expect(total).toBeCloseTo(0.001)
        })

        it("faz clamp do Δt em 5s quando o gap entre amostras é maior", () => {
            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            // Gap de 60s (medidor "silencioso") — Δt deve ser limitado a 5s, não 60s.
            vi.setSystemTime(new Date("2026-01-15T14:38:00.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            const snapshots = processor.buffer.drainAll()
            const total = snapshots.reduce((sum, s) => sum + s.energyKwh, 0)
            // 3600W * 5s / 3.6e6 = 0.005 kWh (não 0.06, que seria sem o clamp)
            expect(total).toBeCloseTo(0.005)
        })

        it("timestamp oficial é o momento de recebimento, não deviceTimestamp", () => {
            const now = new Date("2026-01-15T14:37:00.000Z")
            vi.setSystemTime(now)

            let received: Date | undefined
            processor.addSampleListener((sample) => {
                received = sample.receivedAt
            })

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                deviceTimestamp: "2020-01-01T00:00:00.000Z", // deliberadamente muito diferente
            })

            expect(received).toEqual(now)
        })
    })

    describe("listeners", () => {
        it("notifica listeners registrados com a amostra processada", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
            })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0]![0]).toMatchObject({
                meterId: "meter-1",
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
            })
        })

        it("remove o listener ao chamar a função de unsubscribe", () => {
            const listener = vi.fn()
            const unsubscribe = processor.addSampleListener(listener)
            unsubscribe()

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
            })

            expect(listener).not.toHaveBeenCalled()
        })

        it("um listener que lança erro não impede os demais de serem chamados", () => {
            const broken = vi.fn(() => {
                throw new Error("boom")
            })
            const ok = vi.fn()
            processor.addSampleListener(broken)
            processor.addSampleListener(ok)

            expect(() => {
                callProcess(processor, "meter-1", {
                    voltage: 220,
                    current: 2,
                    powerW: 440,
                    powerFactor: 0.95,
                })
            }).not.toThrow()

            expect(ok).toHaveBeenCalledTimes(1)
        })
    })
})
