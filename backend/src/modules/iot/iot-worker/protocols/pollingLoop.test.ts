import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PollingLoop } from "@/modules/iot/iot-worker/protocols/pollingLoop.js"

describe("PollingLoop", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("chama onSample com o resultado de uma leitura bem-sucedida", async () => {
        const onSample = vi.fn()
        const onError = vi.fn()
        const loop = new PollingLoop({
            intervalMs: 100,
            readSample: () => Promise.resolve({ voltage: 220 }),
            onSample,
            onError,
            onUnhealthy: vi.fn(),
        })

        loop.start()
        await vi.advanceTimersByTimeAsync(100)

        expect(onSample).toHaveBeenCalledWith({ voltage: 220 })
        expect(onError).not.toHaveBeenCalled()
        loop.stop()
    })

    // Regressão: antes, `setInterval` cru disparava de novo
    // mesmo com o tick anterior ainda em andamento — uma leitura mais lenta
    // que o intervalo empilhava execuções concorrentes sobre a mesma conexão.
    it("não reentra: um tick ainda em andamento faz o próximo disparo ser ignorado", async () => {
        const pendingRead: { resolve: (() => void) | null } = { resolve: null }
        const readSample = vi.fn(
            () =>
                new Promise<Record<string, unknown>>((resolve) => {
                    pendingRead.resolve = () => resolve({ voltage: 1 })
                }),
        )
        const loop = new PollingLoop({
            intervalMs: 50,
            timeoutMs: 10_000,
            readSample,
            onSample: vi.fn(),
            onError: vi.fn(),
            onUnhealthy: vi.fn(),
        })

        loop.start()
        // 3 intervalos se passam com a primeira leitura ainda pendente —
        // sem a guarda de reentrância, readSample seria chamado ~3 vezes.
        await vi.advanceTimersByTimeAsync(150)
        expect(readSample).toHaveBeenCalledTimes(1)

        pendingRead.resolve?.()
        await vi.advanceTimersByTimeAsync(0)
        loop.stop()
    })

    // Regressão: antes, nenhuma chamada de leitura tinha
    // timeout — um socket travado bloqueava o tick indefinidamente.
    it("timeout: leitura que nunca resolve é tratada como erro, não trava o loop", async () => {
        const onError = vi.fn()
        const onSample = vi.fn()
        const loop = new PollingLoop({
            intervalMs: 1000,
            timeoutMs: 50,
            readSample: () => new Promise(() => {}), // nunca resolve
            onSample,
            onError,
            onUnhealthy: vi.fn(),
        })

        loop.start()
        // 1000ms para o tick disparar + 50ms para o timeout interno vencer.
        await vi.advanceTimersByTimeAsync(1050)

        expect(onSample).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledTimes(1)
        expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/timeout/i)
        loop.stop()
    })

    // Regressão: o timeout desistir de esperar não significa que a leitura
    // original parou — sem manter `inFlight` travado até ela assentar de
    // verdade, um socket Modbus (request/response sobre uma única conexão)
    // podia receber uma segunda requisição sobreposta à primeira, ainda
    // pendente, intercalando respostas.
    it("timeout não libera o próximo tick até a leitura original de fato assentar", async () => {
        const pendingRead: { resolve: (() => void) | null } = { resolve: null }
        const readSample = vi.fn(
            () =>
                new Promise<Record<string, unknown>>((resolve) => {
                    pendingRead.resolve = () => resolve({ voltage: 1 })
                }),
        )
        const onError = vi.fn()
        const loop = new PollingLoop({
            intervalMs: 50,
            timeoutMs: 20,
            readSample,
            onSample: vi.fn(),
            onError,
            onUnhealthy: vi.fn(),
        })

        loop.start()
        // Primeiro tick dispara em 50ms, timeout de 20ms vence em 70ms —
        // o tick já reportou erro, mas a leitura original continua pendente
        // (nunca foi resolvida). Mais 2 intervalos se passam (150ms, 200ms)
        // sem que um novo tick chame readSample de novo.
        await vi.advanceTimersByTimeAsync(220)
        expect(readSample).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)

        // A leitura original finalmente assenta — só agora o próximo tick
        // (já vencido no relógio) pode disparar.
        pendingRead.resolve?.()
        await vi.advanceTimersByTimeAsync(50)
        expect(readSample).toHaveBeenCalledTimes(2)

        loop.stop()
    })

    it("shouldRun() false pula o tick sem chamar readSample nem onError", async () => {
        const readSample = vi.fn(() => Promise.resolve({}))
        const loop = new PollingLoop({
            intervalMs: 50,
            shouldRun: () => false,
            readSample,
            onSample: vi.fn(),
            onError: vi.fn(),
            onUnhealthy: vi.fn(),
        })

        loop.start()
        await vi.advanceTimersByTimeAsync(150)

        expect(readSample).not.toHaveBeenCalled()
        loop.stop()
    })

    // Regressão: antes, uma conexão morta ficava tentando ler
    // para sempre, sem nunca sinalizar que precisa reconectar.
    it("aciona onUnhealthy após N falhas consecutivas (default 3), e reseta o contador após um sucesso", async () => {
        const onUnhealthy = vi.fn()
        let shouldFail = true
        const loop = new PollingLoop({
            intervalMs: 10,
            timeoutMs: 5,
            readSample: () =>
                shouldFail ? Promise.reject(new Error("falha")) : Promise.resolve({ voltage: 1 }),
            onSample: vi.fn(),
            onError: vi.fn(),
            onUnhealthy,
        })

        loop.start()
        await vi.advanceTimersByTimeAsync(10) // falha 1
        await vi.advanceTimersByTimeAsync(10) // falha 2
        expect(onUnhealthy).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(10) // falha 3 — teto atingido
        expect(onUnhealthy).toHaveBeenCalledTimes(1)

        shouldFail = false
        await vi.advanceTimersByTimeAsync(10) // sucesso — reseta o contador
        shouldFail = true
        await vi.advanceTimersByTimeAsync(10) // falha 1 de novo
        await vi.advanceTimersByTimeAsync(10) // falha 2 de novo
        expect(onUnhealthy).toHaveBeenCalledTimes(1) // ainda não bateu 3 de novo

        loop.stop()
    })

    it("stop() interrompe o agendamento — nenhum tick roda depois", async () => {
        const readSample = vi.fn(() => Promise.resolve({}))
        const loop = new PollingLoop({
            intervalMs: 50,
            readSample,
            onSample: vi.fn(),
            onError: vi.fn(),
            onUnhealthy: vi.fn(),
        })

        loop.start()
        await vi.advanceTimersByTimeAsync(50)
        expect(readSample).toHaveBeenCalledTimes(1)

        loop.stop()
        await vi.advanceTimersByTimeAsync(200)
        expect(readSample).toHaveBeenCalledTimes(1)
    })
})
