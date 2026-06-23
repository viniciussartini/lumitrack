import { describe, it, expect, beforeEach, vi } from "vitest"
import { createAlertStream } from "@/lib/sse/alertStream"
import type { Alert } from "@/types/alert.types"

/**
 * Mock da lib @microsoft/fetch-event-source.
 *
 * Decisão: mockar a lib INTEIRA porque o que queremos testar é a nossa
 * lógica de despacho de eventos (filtragem por nome, parsing JSON,
 * tratamento de erro fatal). A lib em si é responsabilidade dela.
 *
 * O mock expõe `lastConfig` pra os testes inspecionarem a config que
 * passamos pra `fetchEventSource`, incluindo os callbacks.
 */

interface MockFetchEventSourceConfig {
    signal?: AbortSignal
    headers?: Record<string, string>
    onopen?: (response: Response) => Promise<void>
    onmessage?: (event: { event: string; data: string }) => void
    onerror?: (error: unknown) => void
}

let lastConfig: MockFetchEventSourceConfig | null = null

vi.mock("@microsoft/fetch-event-source", () => ({
    EventStreamContentType: "text/event-stream",
    fetchEventSource: vi.fn(
        (_url: string, config: MockFetchEventSourceConfig) => {
            lastConfig = config
            // Retorna uma promise que nunca resolve naturalmente — só via abort
            return new Promise<void>((_, reject) => {
                config.signal?.addEventListener("abort", () => reject(new Error("aborted")))
            })
        },
    ),
}))

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: new Date().toISOString(),
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
    lastConfig = null
})

// ─────────────────────────────────────────────────────────────────────────────
// Conexão (config passada à lib)
// ─────────────────────────────────────────────────────────────────────────────

describe("createAlertStream — conexão", () => {
    it("passa Authorization header com o token", () => {
        createAlertStream({
            token: "abc.def.ghi",
            onAlert: vi.fn(),
        })

        expect(lastConfig?.headers?.Authorization).toBe("Bearer abc.def.ghi")
    })

    it("passa Accept: text/event-stream", () => {
        createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
        })

        expect(lastConfig?.headers?.Accept).toBe("text/event-stream")
    })

    it("retorna cleanup que dispara abort", () => {
        const cleanup = createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
        })

        const signal = lastConfig?.signal
        expect(signal?.aborted).toBe(false)

        cleanup()

        expect(signal?.aborted).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// onopen
// ─────────────────────────────────────────────────────────────────────────────

describe("createAlertStream — onopen", () => {
    it("dispara onOpen quando response.ok + content-type correto", async () => {
        const onOpen = vi.fn()
        createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
            onOpen,
        })

        const response = new Response(null, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
        })

        await lastConfig?.onopen?.(response)

        expect(onOpen).toHaveBeenCalled()
    })

    it("NÃO dispara onOpen e lança erro fatal em status 401", async () => {
        const onOpen = vi.fn()
        createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
            onOpen,
        })

        const response = new Response(null, {
            status: 401,
            headers: { "content-type": "application/json" },
        })

        await expect(lastConfig?.onopen?.(response)).rejects.toThrow(
            /HTTP 401/,
        )
        expect(onOpen).not.toHaveBeenCalled()
    })

    it("lança erro fatal quando content-type não é event-stream (mesmo com 200)", async () => {
        createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
        })

        const response = new Response("plain text", {
            status: 200,
            headers: { "content-type": "text/plain" },
        })

        await expect(lastConfig?.onopen?.(response)).rejects.toThrow()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// onmessage (filtragem por nome de evento)
// ─────────────────────────────────────────────────────────────────────────────

describe("createAlertStream — onmessage", () => {
    it("dispara onAlert quando evento é 'alert' com payload válido", () => {
        const onAlert = vi.fn()
        const alert = makeAlert()
        createAlertStream({ token: "abc", onAlert })

        lastConfig?.onmessage?.({
            event: "alert",
            data: JSON.stringify(alert),
        })

        expect(onAlert).toHaveBeenCalledWith(alert)
    })

    it("IGNORA eventos 'connected' (não dispara onAlert)", () => {
        const onAlert = vi.fn()
        createAlertStream({ token: "abc", onAlert })

        lastConfig?.onmessage?.({
            event: "connected",
            data: JSON.stringify({ deviceCount: 3 }),
        })

        expect(onAlert).not.toHaveBeenCalled()
    })

    it("IGNORA eventos 'reading' (leituras IoT, não usamos nesta camada)", () => {
        const onAlert = vi.fn()
        createAlertStream({ token: "abc", onAlert })

        lastConfig?.onmessage?.({
            event: "reading",
            data: JSON.stringify({ deviceId: "x", kwhConsumed: 0.5 }),
        })

        expect(onAlert).not.toHaveBeenCalled()
    })

    it("dispara onError quando payload do 'alert' é JSON inválido", () => {
        const onAlert = vi.fn()
        const onError = vi.fn()
        createAlertStream({ token: "abc", onAlert, onError })

        lastConfig?.onmessage?.({
            event: "alert",
            data: "not-a-json{{{",
        })

        expect(onAlert).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalled()
    })

    it("continua processando mensagens DEPOIS de um JSON parse falhar", () => {
        const onAlert = vi.fn()
        const onError = vi.fn()
        const alert = makeAlert()
        createAlertStream({ token: "abc", onAlert, onError })

        // Mensagem inválida → onError, NÃO aborta
        lastConfig?.onmessage?.({
            event: "alert",
            data: "lixo",
        })
        expect(onError).toHaveBeenCalled()

        // Próxima mensagem válida → onAlert dispara normalmente
        lastConfig?.onmessage?.({
            event: "alert",
            data: JSON.stringify(alert),
        })
        expect(onAlert).toHaveBeenCalledWith(alert)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// onerror
// ─────────────────────────────────────────────────────────────────────────────

describe("createAlertStream — onerror", () => {
    it("dispara o callback onError", () => {
        const onError = vi.fn()
        createAlertStream({
            token: "abc",
            onAlert: vi.fn(),
            onError,
        })

        const err = new Error("Network blip")
        try {
            lastConfig?.onerror?.(err)
        } catch {
            // pode re-lançar fatal — outros testes verificam isso
        }

        expect(onError).toHaveBeenCalledWith(err)
    })
})