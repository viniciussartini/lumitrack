import { describe, it, expect, vi, beforeEach } from "vitest"
import { MinuteRollupScheduler } from "@/modules/iot/iot-worker/MinuteRollupScheduler.js"
import { MinuteBuffer } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"

function fakeRepository(): MeterReadingRepository {
    return { upsertMinute: vi.fn().mockResolvedValue(undefined) } as unknown as MeterReadingRepository
}

describe("MinuteRollupScheduler", () => {
    let buffer: MinuteBuffer

    beforeEach(() => {
        buffer = new MinuteBuffer()
    })

    describe("flush", () => {
        it("não chama o repositório quando não há baldes completos", async () => {
            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)

            await scheduler.flush()

            expect(repository.upsertMinute).not.toHaveBeenCalled()
        })

        it("persiste cada balde completo via upsertMinute", async () => {
            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))
            buffer.add("meter-2", { energyKwh: 0.002, voltage: 127, current: 1, powerW: 127, powerFactor: 0.9, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))

            vi.useFakeTimers()
            vi.setSystemTime(new Date("2026-01-15T14:38:00.000Z"))
            await scheduler.flush()
            vi.useRealTimers()

            expect(repository.upsertMinute).toHaveBeenCalledTimes(2)
        })

        it("não drena o balde do minuto em curso", async () => {
            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)

            vi.useFakeTimers()
            vi.setSystemTime(new Date("2026-01-15T14:37:30.000Z"))
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 })

            await scheduler.flush()
            vi.useRealTimers()

            expect(repository.upsertMinute).not.toHaveBeenCalled()
        })

        it("reinsere no buffer (merge) o balde cujo upsert falhou, sem perder sampleCount", async () => {
            const repository = {
                upsertMinute: vi.fn().mockRejectedValue(new Error("db down")),
            } as unknown as MeterReadingRepository
            const scheduler = new MinuteRollupScheduler(buffer, repository)

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:30.000Z"))
            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date("2026-01-15T14:37:31.000Z"))

            vi.useFakeTimers()
            vi.setSystemTime(new Date("2026-01-15T14:38:00.000Z"))
            await scheduler.flush()
            vi.useRealTimers()

            expect(repository.upsertMinute).toHaveBeenCalledTimes(1)

            // O balde deve ter voltado ao buffer com os 2 samples originais preservados.
            const drained = buffer.drainAll()
            expect(drained).toHaveLength(1)
            expect(drained[0]!.sampleCount).toBe(2)
            expect(drained[0]!.secondsCovered).toBe(2)
        })
    })

    describe("flushAll", () => {
        it("drena inclusive o balde do minuto em curso", async () => {
            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)

            buffer.add("meter-1", { energyKwh: 0.001, voltage: 220, current: 2, powerW: 440, powerFactor: 0.95, deltaSeconds: 1 }, new Date())

            await scheduler.flushAll()

            expect(repository.upsertMinute).toHaveBeenCalledTimes(1)
        })
    })

    describe("start/stop", () => {
        it("agenda o primeiro flush alinhado ao início do próximo minuto", () => {
            vi.useFakeTimers()
            vi.setSystemTime(new Date("2026-01-15T14:37:22.500Z"))

            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)
            const setTimeoutSpy = vi.spyOn(global, "setTimeout")

            scheduler.start()

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 37_500)

            scheduler.stop()
            vi.useRealTimers()
        })

        it("stop() cancela os timers sem lançar erro mesmo sem start() prévio", () => {
            const repository = fakeRepository()
            const scheduler = new MinuteRollupScheduler(buffer, repository)
            expect(() => scheduler.stop()).not.toThrow()
        })
    })
})
