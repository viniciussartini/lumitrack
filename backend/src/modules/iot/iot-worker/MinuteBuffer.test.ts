import { describe, it, expect } from "vitest"
import { MinuteBuffer } from "@/modules/iot/iot-worker/MinuteBuffer.js"

describe("MinuteBuffer", () => {
    describe("add", () => {
        it("acumula energia e médias ponderadas por Δt no mesmo balde", () => {
            const buffer = new MinuteBuffer()
            const minute = new Date("2026-01-15T14:37:00.000Z")

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:10.000Z"))
            buffer.add("meter-1", { energyKwh: 0.002, voltage: 222, current: 3, powerW: 666, powerFactor: 0.9, deltaSeconds: 2 }, new Date("2026-01-15T14:37:12.000Z"))

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))

            expect(snapshots).toHaveLength(1)
            const snap = snapshots[0]!
            expect(snap.meterId).toBe("meter-1")
            expect(snap.minuteStart).toEqual(minute)
            expect(snap.energyKwh).toBeCloseTo(0.003)
            expect(snap.sampleCount).toBe(2)
            expect(snap.secondsCovered).toBe(3)
            // Média ponderada: (220*1 + 222*2) / 3 = 221.33...
            expect(snap.avgVoltage).toBeCloseTo((220 * 1 + 222 * 2) / 3)
            expect(snap.avgPowerW).toBeCloseTo((440 * 1 + 666 * 2) / 3)
        })

        it("primeira amostra com deltaSeconds=0 não distorce a média (peso zero)", () => {
            const buffer = new MinuteBuffer()

            // Primeira amostra do medidor: deltaSeconds=0 (sem histórico prévio).
            buffer.add("meter-1", { energyKwh: 0, voltage: 999, current: 999, powerW: 999, powerFactor: 1, deltaSeconds: 0 }, new Date("2026-01-15T14:37:05.000Z"))
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:06.000Z"))

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))
            const snap = snapshots[0]!

            // A amostra de peso 0 não deve influenciar a média — só a segunda conta.
            expect(snap.avgVoltage).toBeCloseTo(220)
            expect(snap.sampleCount).toBe(2)
            expect(snap.secondsCovered).toBe(1)
        })

        it("separa amostras em baldes diferentes por minuto", () => {
            const buffer = new MinuteBuffer()

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:59.000Z"))
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:38:01.000Z"))

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:39:00.000Z"))

            expect(snapshots).toHaveLength(2)
            const minutes = snapshots.map((s) => s.minuteStart.toISOString()).sort()
            expect(minutes).toEqual([
                "2026-01-15T14:37:00.000Z",
                "2026-01-15T14:38:00.000Z",
            ])
        })

        it("separa baldes por medidor", () => {
            const buffer = new MinuteBuffer()
            const at = new Date("2026-01-15T14:37:10.000Z")

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, at)
            buffer.add("meter-2", { energyKwh: 0.002, voltage: 127, current: 1, powerW: 127, powerFactor: 0.9, deltaSeconds: 1 }, at)

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))
            expect(snapshots).toHaveLength(2)
            expect(snapshots.map((s) => s.meterId).sort()).toEqual(["meter-1", "meter-2"])
        })
    })

    describe("drainCompletedBuckets", () => {
        it("não drena o balde do minuto em curso", () => {
            const buffer = new MinuteBuffer()

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))

            // "now" ainda está dentro do minuto 14:37 — o balde não deve drenar.
            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:37:45.000Z"))
            expect(snapshots).toHaveLength(0)
        })

        it("remove os baldes drenados do buffer (não drena duas vezes)", () => {
            const buffer = new MinuteBuffer()
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))

            const first = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))
            const second = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))

            expect(first).toHaveLength(1)
            expect(second).toHaveLength(0)
            expect(buffer.activeMeterCount()).toBe(0)
        })
    })

    describe("drainAll", () => {
        it("drena inclusive o balde do minuto em curso", () => {
            const buffer = new MinuteBuffer()
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))

            const snapshots = buffer.drainAll()
            expect(snapshots).toHaveLength(1)
            expect(buffer.activeMeterCount()).toBe(0)
        })
    })

    describe("merge", () => {
        it("reinsere um snapshot preservando sampleCount e secondsCovered", () => {
            const buffer = new MinuteBuffer()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            buffer.merge({
                meterId: "meter-1",
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                sampleCount: 47,
                secondsCovered: 50,
            })

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))
            expect(snapshots).toHaveLength(1)
            const snap = snapshots[0]!
            expect(snap.sampleCount).toBe(47)
            expect(snap.secondsCovered).toBe(50)
            expect(snap.avgVoltage).toBeCloseTo(220)
            expect(snap.energyKwh).toBeCloseTo(0.01)
        })

        it("combina merge com amostras novas no mesmo minuto", () => {
            const buffer = new MinuteBuffer()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            buffer.merge({
                meterId: "meter-1",
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 200,
                avgCurrent: 5,
                avgPowerW: 1000,
                avgPowerFactor: 0.9,
                sampleCount: 10,
                secondsCovered: 10,
            })
            buffer.add("meter-1", { energyKwh: 0.005, voltage: 220, current: 5, powerW: 1100, powerFactor: 0.9, deltaSeconds: 10 }, new Date("2026-01-15T14:37:20.000Z"))

            const snapshots = buffer.drainCompletedBuckets(new Date("2026-01-15T14:38:00.000Z"))
            const snap = snapshots[0]!
            expect(snap.sampleCount).toBe(11)
            expect(snap.secondsCovered).toBe(20)
            expect(snap.energyKwh).toBeCloseTo(0.015)
            // (200*10 + 220*10) / 20 = 210
            expect(snap.avgVoltage).toBeCloseTo(210)
        })
    })

    describe("getLatest", () => {
        it("retorna null para medidor sem leituras", () => {
            const buffer = new MinuteBuffer()
            expect(buffer.getLatest("nao-existe")).toBeNull()
        })

        it("retorna a leitura mais recente do medidor", () => {
            const buffer = new MinuteBuffer()
            buffer.add("meter-1", { energyKwh: 0, voltage: 220, current: 1, powerW: 220, powerFactor: 1, deltaSeconds: 0 }, new Date("2026-01-15T14:37:00.000Z"))
            buffer.add("meter-1", { energyKwh: 0, voltage: 225, current: 1, powerW: 225, powerFactor: 1, deltaSeconds: 1 }, new Date("2026-01-15T14:37:05.000Z"))

            const latest = buffer.getLatest("meter-1")
            expect(latest?.voltage).toBe(225)
        })
    })
})
