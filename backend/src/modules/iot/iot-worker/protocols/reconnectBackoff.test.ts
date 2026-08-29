import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { scheduleReconnect } from "@/modules/iot/iot-worker/protocols/reconnectBackoff.js"

describe("scheduleReconnect", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("chama reconnect() após o delay base na primeira tentativa", async () => {
        const reconnect = vi.fn(() => Promise.resolve())

        scheduleReconnect({
            meterId: "m1",
            moduleTag: "Test",
            reconnect,
            isStopped: () => false,
            baseDelayMs: 100,
        })

        await vi.advanceTimersByTimeAsync(99)
        expect(reconnect).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        expect(reconnect).toHaveBeenCalledTimes(1)
    })

    // Regressão (issue #308): antes, nenhum adaptador reconectava sozinho —
    // uma queda de transporte exigia intervenção manual (restart()).
    it("dobra o delay a cada falha (backoff exponencial), até o teto", async () => {
        const reconnect = vi.fn(() => Promise.reject(new Error("ainda fora do ar")))

        scheduleReconnect({
            meterId: "m1",
            moduleTag: "Test",
            reconnect,
            isStopped: () => false,
            baseDelayMs: 100,
            maxDelayMs: 500,
        })

        await vi.advanceTimersByTimeAsync(100) // tentativa 1 (delay 100)
        expect(reconnect).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(200) // tentativa 2 (delay 200)
        expect(reconnect).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(400) // tentativa 3 (delay 400)
        expect(reconnect).toHaveBeenCalledTimes(3)

        await vi.advanceTimersByTimeAsync(500) // tentativa 4 (delay teria sido 800, mas o teto é 500)
        expect(reconnect).toHaveBeenCalledTimes(4)
    })

    it("para de tentar quando reconnect() finalmente resolve", async () => {
        let succeed = false
        const reconnect = vi.fn(() =>
            succeed ? Promise.resolve() : Promise.reject(new Error("fora do ar")),
        )

        scheduleReconnect({
            meterId: "m1",
            moduleTag: "Test",
            reconnect,
            isStopped: () => false,
            baseDelayMs: 100,
        })

        await vi.advanceTimersByTimeAsync(100)
        expect(reconnect).toHaveBeenCalledTimes(1)

        succeed = true
        await vi.advanceTimersByTimeAsync(200)
        expect(reconnect).toHaveBeenCalledTimes(2)

        // Nenhuma nova tentativa agendada depois do sucesso.
        await vi.advanceTimersByTimeAsync(10_000)
        expect(reconnect).toHaveBeenCalledTimes(2)
    })

    // Regressão (issue #308): sem isStopped(), uma reconexão em andamento
    // reviveria uma conexão que o usuário pediu para encerrar (disconnect()
    // intencional não deve virar reconexão automática).
    it("isStopped() true interrompe as tentativas — nenhuma chamada a reconnect()", async () => {
        const reconnect = vi.fn(() => Promise.reject(new Error("fora do ar")))

        scheduleReconnect({
            meterId: "m1",
            moduleTag: "Test",
            reconnect,
            isStopped: () => true,
            baseDelayMs: 100,
        })

        await vi.advanceTimersByTimeAsync(10_000)
        expect(reconnect).not.toHaveBeenCalled()
    })
})
