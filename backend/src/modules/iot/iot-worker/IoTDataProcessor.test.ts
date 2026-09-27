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
            ["reactivePowerVar", 2_000_000],
            ["reactivePowerVar", -2_000_000],
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

        it("aceita reactivePowerVar negativo (carga capacitiva — potência reativa tem sinal)", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                reactivePowerVar: -144.6,
            })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0]![0].reactivePowerVar).toBe(-144.6)
        })

        it("null (JSON não tem undefined) em uma grandeza opcional é tratado como ausente, não reprova a amostra", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                thdCurrentPhaseA: null,
            })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener.mock.calls[0]![0].thdCurrentPhaseA).toBeUndefined()
        })

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

        it("processa e persiste corretamente um payload com as 21 grandezas por fase simultaneamente (formato publicado pelo iot-simulator)", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            const fullPhasePayload = {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                voltagePhaseA: 218,
                voltagePhaseB: 220,
                voltagePhaseC: 222,
                currentPhaseA: 1.9,
                currentPhaseB: 2,
                currentPhaseC: 2.1,
                activePowerPhaseA: 146,
                activePowerPhaseB: 147,
                activePowerPhaseC: 147,
                reactivePowerVar: 144.6,
                apparentPowerVa: 463.2,
                frequencyHz: 60.02,
                powerFactorPhaseA: 0.94,
                powerFactorPhaseB: 0.95,
                powerFactorPhaseC: 0.96,
                thdVoltagePhaseA: 2.1,
                thdVoltagePhaseB: 1.9,
                thdVoltagePhaseC: 2.0,
                thdCurrentPhaseA: 5.2,
                thdCurrentPhaseB: 4.8,
                thdCurrentPhaseC: 5.0,
            }

            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", fullPhasePayload)

            expect(listener.mock.calls[0]![0]).toMatchObject(fullPhasePayload)
            expect(listener.mock.calls[0]![0].voltageUnbalance).toBeCloseTo((2 / 220) * 100)

            // Primeira amostra do medidor: sem amostra anterior, deltaSeconds
            // é sempre 0 — sem peso nenhum, as 22 grandezas por fase ficam
            // `null` (ausentes), nunca uma fração distorcida ou um fallback
            // em 0 (ausência não é uma medição). Uma segunda amostra, 1s
            // depois, já tem peso real e as grandezas passam a ter média
            // calculável.
            vi.setSystemTime(new Date("2026-01-15T14:37:01.000Z"))
            callProcess(processor, "meter-1", fullPhasePayload)

            const snapshots = processor.buffer.drainAll()
            expect(snapshots).toHaveLength(1)
            expect(snapshots[0]!.avgVoltagePhaseA).toBeCloseTo(fullPhasePayload.voltagePhaseA)
            expect(snapshots[0]!.avgThdCurrentPhaseC).toBeCloseTo(fullPhasePayload.thdCurrentPhaseC)
            expect(snapshots[0]!.avgVoltageUnbalance).toBeCloseTo((2 / 220) * 100)
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

    describe("payload não confiável — nenhum campo além das grandezas conhecidas passa", () => {
        it("um payload com meterId, energyKwh, deltaSeconds e uma chave desconhecida não sobrescreve nada calculado no servidor", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            vi.setSystemTime(new Date("2026-01-15T14:37:00.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
            })

            // 1s depois, com powerW=3600 → energia esperada = 0.001 kWh. O
            // payload malicioso tenta forjar meterId (roubar o roteamento do
            // SSE/AlertEvaluator de outro medidor), energyKwh e deltaSeconds
            // (adulterar consumo/custo calculados no servidor) e uma chave
            // qualquer sem relação nenhuma com grandeza elétrica.
            vi.setSystemTime(new Date("2026-01-15T14:37:01.000Z"))
            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 3600,
                powerFactor: 1,
                meterId: "meter-attacker-controlled",
                energyKwh: 9999,
                deltaSeconds: 3600,
                chaveDesconhecida: "qualquer coisa",
            })

            // O listener recebe o sample com o meterId real da conexão (1º
            // argumento de `process`), nunca o do payload.
            expect(listener).toHaveBeenCalledTimes(2)
            expect(listener.mock.calls[1]![0].meterId).toBe("meter-1")
            expect(listener.mock.calls[1]![0]).not.toHaveProperty("chaveDesconhecida")
            expect(listener.mock.calls[1]![0]).not.toHaveProperty("deltaSeconds")
            expect(listener.mock.calls[1]![0]).not.toHaveProperty("energyKwh")

            // O balde acumula a energia CALCULADA (powerW × Δt real), não o
            // valor forjado de `energyKwh` no payload.
            const snapshots = processor.buffer.drainAll()
            const totalEnergy = snapshots.reduce((sum, s) => sum + s.energyKwh, 0)
            expect(totalEnergy).toBeCloseTo(0.001)
        })

        it("uma grandeza por fase legítima chega, mas uma chave desconhecida no mesmo payload não", () => {
            const listener = vi.fn()
            processor.addSampleListener(listener)

            callProcess(processor, "meter-1", {
                voltage: 220,
                current: 2,
                powerW: 440,
                powerFactor: 0.95,
                voltagePhaseA: 219,
                umaChaveQualquerDoFabricante: 42,
            })

            expect(listener.mock.calls[0]![0].voltagePhaseA).toBe(219)
            expect(listener.mock.calls[0]![0]).not.toHaveProperty("umaChaveQualquerDoFabricante")
        })
    })
})
