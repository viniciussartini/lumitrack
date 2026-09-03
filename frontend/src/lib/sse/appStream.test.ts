import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { fetchEventSource, type FetchEventSourceInit } from "@microsoft/fetch-event-source"
import type { createAppStream as CreateAppStream } from "@/lib/sse/appStream"

/**
 * O cliente usa `fetchEventSource` (fetch + ReadableStream), não o
 * `EventSource` nativo — mockar a lib é o ponto de isolamento real.
 *
 * `VITE_SSE_URL` é fixada aqui (`vi.stubEnv` + `vi.resetModules` + import
 * dinâmico em `beforeEach`) como uma URL absoluta, escolhendo
 * deliberadamente o caminho cross-origin (`connectCrossOrigin`) — o mesmo
 * `buildHandlers`/`parseAndDispatch` que o caminho same-origin usa, mais o
 * laço de reconexão próprio (não delegado à lib) que só existe aqui. Sem
 * fixar, o caminho exercitado dependeria do `.env` carregado pelo processo
 * de teste — se `VITE_SSE_URL` mudasse pra relativa ou sumisse numa máquina,
 * o teste passaria a exercitar o caminho same-origin sem avisar.
 */
vi.mock("@microsoft/fetch-event-source", () => ({
    fetchEventSource: vi.fn(),
    EventStreamContentType: "text/event-stream",
}))

const mockedFetchEventSource = vi.mocked(fetchEventSource)

let ticketCounter = 0
let createAppStream: typeof CreateAppStream

/**
 * A cadeia real até o `fetchEventSource` mockado ser chamado atravessa mais
 * de uma resolução de Promise (`fetch()` → `response.json()`) — quantos
 * microtasks exatamente uma única chamada de `vi.advanceTimersByTimeAsync(0)`
 * garante drenar não é uma garantia documentada da API, e variou entre
 * ambiente local e CI (mesmo código, mesma versão do Vitest). Repetir um
 * número fixo de vezes é determinístico e não consome o relógio falso (cada
 * rodada avança 0ms) — ao contrário de `vi.waitFor`, que soma ~50ms reais
 * de relógio falso por tentativa de poll e pode estourar sozinho um budget
 * de delay que o teste está justamente tentando medir com precisão.
 */
async function flushPendingPromises(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(0)
    }
}

beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("VITE_SSE_URL", "https://api.lumitrack.example/api/iot/stream")
    ;({ createAppStream } = await import("@/lib/sse/appStream"))

    ticketCounter = 0
    vi.stubGlobal(
        "fetch",
        vi.fn(() => {
            ticketCounter += 1
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: { ticket: `ticket-${ticketCounter}` } }),
            } as Response)
        }),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

describe("createAppStream — evento válido", () => {
    it("despacha 'reading' pro onReading correspondente", async () => {
        mockedFetchEventSource.mockReturnValue(new Promise(() => {}))
        const onReading = vi.fn()

        createAppStream({ onReading })

        await vi.waitFor(() => expect(mockedFetchEventSource).toHaveBeenCalled())
        const init = mockedFetchEventSource.mock.calls[0]![1] as FetchEventSourceInit

        const reading = {
            meterId: "meter-1",
            voltage: 220,
            current: 5,
            powerW: 1100,
            powerFactor: 0.98,
            receivedAt: "2026-01-01T00:00:00.000Z",
        }
        init.onmessage!({ id: "1", event: "reading", data: JSON.stringify(reading) })

        expect(onReading).toHaveBeenCalledWith(reading)
    })

    it("evento sem handler correspondente (ex.: keep-alive) não lança nem chama nenhum callback", async () => {
        mockedFetchEventSource.mockReturnValue(new Promise(() => {}))
        const onReading = vi.fn()
        const onConnected = vi.fn()

        createAppStream({ onReading, onConnected })

        await vi.waitFor(() => expect(mockedFetchEventSource).toHaveBeenCalled())
        const init = mockedFetchEventSource.mock.calls[0]![1] as FetchEventSourceInit

        expect(() => init.onmessage!({ id: "", event: "", data: "" })).not.toThrow()
        expect(onReading).not.toHaveBeenCalled()
        expect(onConnected).not.toHaveBeenCalled()
    })
})

describe("createAppStream — evento malformado", () => {
    it("JSON inválido dispara onError sem lançar nem chamar o handler do evento", async () => {
        mockedFetchEventSource.mockReturnValue(new Promise(() => {}))
        const onReading = vi.fn()
        const onError = vi.fn()

        createAppStream({ onReading, onError })

        await vi.waitFor(() => expect(mockedFetchEventSource).toHaveBeenCalled())
        const init = mockedFetchEventSource.mock.calls[0]![1] as FetchEventSourceInit

        expect(() =>
            init.onmessage!({ id: "1", event: "reading", data: "{ isso não é JSON" }),
        ).not.toThrow()
        expect(onReading).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0]![0]).toBeInstanceOf(SyntaxError)
    })

    it("resposta inicial sem content-type de event-stream é tratada como erro fatal (onopen lança)", async () => {
        mockedFetchEventSource.mockReturnValue(new Promise(() => {}))

        createAppStream({})

        await vi.waitFor(() => expect(mockedFetchEventSource).toHaveBeenCalled())
        const init = mockedFetchEventSource.mock.calls[0]![1] as FetchEventSourceInit

        const badResponse = { ok: true, headers: new Headers({ "content-type": "text/html" }) }
        await expect(init.onopen!(badResponse as Response)).rejects.toThrow(/SSE failed to open/)
    })
})

describe("createAppStream — reconexão", () => {
    it("após um erro, aguarda o delay e tenta de novo com um ticket novo", async () => {
        vi.useFakeTimers()
        let attempt = 0
        mockedFetchEventSource.mockImplementation(() => {
            attempt += 1
            return attempt === 1 ? Promise.reject(new Error("conexão caiu")) : new Promise(() => {})
        })

        createAppStream({})

        // 1ª tentativa: busca o ticket, chama fetchEventSource, que falha.
        await flushPendingPromises()
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(mockedFetchEventSource).toHaveBeenCalledTimes(1)

        // Antes do delay completar, ainda não tentou de novo.
        await vi.advanceTimersByTimeAsync(1999)
        expect(mockedFetchEventSource).toHaveBeenCalledTimes(1)

        // Delay completo: busca um ticket NOVO (não reaproveita o consumido)
        // e tenta de novo.
        await vi.advanceTimersByTimeAsync(1)
        await flushPendingPromises()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(mockedFetchEventSource).toHaveBeenCalledTimes(2)

        const firstUrl = mockedFetchEventSource.mock.calls[0]![0] as string
        const secondUrl = mockedFetchEventSource.mock.calls[1]![0] as string
        expect(firstUrl).toContain("ticket-1")
        expect(secondUrl).toContain("ticket-2")
        expect(secondUrl).not.toBe(firstUrl)
    })

    it("a função de cleanup aborta a conexão e para o laço de reconexão", async () => {
        vi.useFakeTimers()
        mockedFetchEventSource.mockImplementation(() => Promise.reject(new Error("conexão caiu")))

        const cleanup = createAppStream({})

        await flushPendingPromises()
        expect(mockedFetchEventSource).toHaveBeenCalledTimes(1)

        cleanup()

        // Mesmo passando bem além do delay de reconexão, nenhuma tentativa
        // nova acontece — o `while (!controller.signal.aborted)` já saiu.
        await vi.advanceTimersByTimeAsync(5000)
        expect(mockedFetchEventSource).toHaveBeenCalledTimes(1)
    })
})
