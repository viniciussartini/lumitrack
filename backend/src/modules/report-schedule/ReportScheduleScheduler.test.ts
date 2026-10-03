import { describe, it, expect, vi, afterEach } from "vitest"
import { ReportScheduleScheduler } from "@/modules/report-schedule/ReportScheduleScheduler.js"
import type { ReportScheduleRunner } from "@/modules/report-schedule/ReportScheduleRunner.js"

const runnerWith = (runDue: () => Promise<void>) => ({ runDue }) as unknown as ReportScheduleRunner

afterEach(() => {
    vi.useRealTimers()
})

describe("ReportScheduleScheduler", () => {
    it("roda no boot e a cada 15 minutos até ser parado", async () => {
        vi.useFakeTimers()
        const runDue = vi.fn().mockResolvedValue(undefined)
        const scheduler = new ReportScheduleScheduler(runnerWith(runDue))

        scheduler.start()
        expect(runDue).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
        expect(runDue).toHaveBeenCalledTimes(2)

        scheduler.stop()
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
        expect(runDue).toHaveBeenCalledTimes(2)
    })

    it("uma falha inesperada não propaga", async () => {
        const scheduler = new ReportScheduleScheduler(
            runnerWith(() => Promise.reject(new Error("banco fora do ar"))),
        )

        await expect(scheduler.runOnce()).resolves.toBeUndefined()
    })

    it("não sobrepõe uma passada lenta com a seguinte", async () => {
        let release: () => void = () => {}
        const runDue = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve
                }),
        )
        const scheduler = new ReportScheduleScheduler(runnerWith(runDue))

        const first = scheduler.runOnce()
        await scheduler.runOnce()
        expect(runDue).toHaveBeenCalledTimes(1)

        release()
        await first
        void scheduler.runOnce()
        expect(runDue).toHaveBeenCalledTimes(2)
    })
})
