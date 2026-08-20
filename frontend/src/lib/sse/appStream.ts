import {
    fetchEventSource,
    EventStreamContentType,
    type EventSourceMessage,
} from "@microsoft/fetch-event-source"
import { getCsrfToken } from "@/lib/csrf"
import type { Notification } from "@/types/notification.types"

/**
 * URL do endpoint SSE do backend — `iot-stream.routes.ts` montado em
 * `/api/iot`, rota `GET /stream`.
 *
 * Caminho relativo por padrão (self-hosted/dev — mesma origem via Caddy ou
 * dev server). Na demo pública do Render (ADR-0010), VITE_SSE_URL aponta
 * para a origem absoluta do serviço da API: o rewrite `/api/*` do site
 * estático não sustenta conexão de longa duração (SSE trava sem nunca
 * entregar dado), então essa única chamada precisa ir cross-origin direto
 * na API.
 */
const SSE_URL = import.meta.env.VITE_SSE_URL || "/api/iot/stream"

// Endpoint que emite o ticket — sempre relativo, sempre same-origin (via
// rewrite quando existir), autenticado por cookie normalmente. Ver
// backend/src/modules/iot/iot-stream.routes.ts e sse-ticket.service.ts.
const SSE_TICKET_URL = "/api/iot/stream-ticket"

// SSE_URL cross-origin (Render) não recebe o cookie de sessão — ele foi
// definido pelo navegador para o domínio do site estático, não para o da
// API; sameSite:"none" não resolve isso (é limite de Domain do cookie, não
// de política cross-site, e Domain=.onrender.com é rejeitado por ser
// sufixo público). Nesse caso, troca um ticket de uso único — obtido
// same-origin — pela conexão, via query string.
function isCrossOrigin(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://")
}

async function fetchTicketUrl(signal: AbortSignal): Promise<string> {
    // POST não é método seguro — o authenticate do backend exige o header
    // CSRF (double-submit) mesmo com cookie válido. services/api.ts faz o
    // mesmo via interceptor do axios; aqui é fetch puro, então replica à
    // mão (mesmo cookie/header, ver lib/csrf.ts).
    const csrfToken = getCsrfToken()
    const response = await fetch(SSE_TICKET_URL, {
        method: "POST",
        credentials: "include",
        signal,
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
    })
    if (!response.ok) {
        throw new Error(`Falha ao obter ticket do stream: HTTP ${response.status}`)
    }
    const body = (await response.json()) as { data: { ticket: string } }
    return `${SSE_URL}?ticket=${encodeURIComponent(body.data.ticket)}`
}

const RECONNECT_DELAY_MS = 2000

function wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener("abort", () => {
            clearTimeout(timer)
            resolve()
        })
    })
}

/**
 * Contrato de eventos (Fase 4/5 — ver backend/src/modules/iot/iot-stream.routes.ts):
 *   connected     { meterCount }
 *   reading       { meterId, voltage, current, powerW, powerFactor, receivedAt }
 *   alert-firing  { type: "start"|"end", alertId, alertName, meterId, startedAt, endedAt? }
 *   notification  { ...Notification }
 */
const EVENT_CONNECTED = "connected"
const EVENT_READING = "reading"
const EVENT_ALERT_FIRING = "alert-firing"
const EVENT_NOTIFICATION = "notification"

export interface ConnectedPayload {
    meterCount: number
}

export interface ReadingPayload {
    meterId: string
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    receivedAt: string
}

export interface AlertFiringPayload {
    type: "start" | "end"
    alertId: string
    alertName: string
    meterId: string
    startedAt: string
    endedAt?: string
}

export interface AppStreamOptions {
    onConnected?: (payload: ConnectedPayload) => void
    onReading?: (payload: ReadingPayload) => void
    onAlertFiring?: (payload: AlertFiringPayload) => void
    onNotification?: (payload: Notification) => void
    /**
     * Erros de parsing/conexão. NÃO fatal por padrão — a lib reconecta
     * sozinha (backoff automático), exceto quando o erro é FatalStreamError
     * (401/content-type inválido).
     */
    onError?: (error: unknown) => void
    onOpen?: () => void
}

/**
 * Sentinela: erro lançado pelo onopen quando a resposta inicial é
 * inválida. `fetch-event-source` trata como fatal e NÃO retenta.
 */
class FatalStreamError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "FatalStreamError"
    }
}

function parseAndDispatch<T>(
    raw: string,
    dispatch: ((payload: T) => void) | undefined,
    onError: ((error: unknown) => void) | undefined,
): void {
    if (!dispatch) return
    try {
        dispatch(JSON.parse(raw) as T)
    } catch (parseError) {
        onError?.(parseError)
    }
}

/**
 * Abre uma conexão SSE única com o backend, despachando por nome de evento.
 * Substitui `createAlertStream` (Fase 4/5) — o contrato deixou de ter um
 * único evento `alert` e passou a ter `connected`/`reading`/`alert-firing`/
 * `notification`.
 *
 * `openWhenHidden: true` — leituras/alertas em tempo real devem continuar
 * chegando mesmo com a aba em background (o RealTimeCard e o WarningBadge
 * são exatamente para serem vistos quando o usuário volta à aba).
 *
 * Retorna uma função de cleanup que aborta a conexão.
 */
interface StreamHandlers {
    onmessage: (event: EventSourceMessage) => void
    onopen: (response: Response) => Promise<void>
}

function buildHandlers(options: AppStreamOptions): StreamHandlers {
    const { onConnected, onReading, onAlertFiring, onNotification, onError, onOpen } = options

    return {
        onmessage: (event) => {
            switch (event.event) {
                case EVENT_CONNECTED:
                    parseAndDispatch(event.data, onConnected, onError)
                    return
                case EVENT_READING:
                    parseAndDispatch(event.data, onReading, onError)
                    return
                case EVENT_ALERT_FIRING:
                    parseAndDispatch(event.data, onAlertFiring, onError)
                    return
                case EVENT_NOTIFICATION:
                    parseAndDispatch(event.data, onNotification, onError)
                    return
                default:
                    // Keep-alive (":") e eventos desconhecidos são ignorados.
                    return
            }
        },
        onopen: async (response) => {
            if (
                response.ok &&
                response.headers.get("content-type")?.startsWith(EventStreamContentType)
            ) {
                onOpen?.()
                return
            }
            throw new FatalStreamError(`SSE failed to open: HTTP ${response.status}`)
        },
    }
}

// Same-origin (dev, self-hosted) — uma única chamada, o fetchEventSource
// cuida do retry/backoff sozinho. Cookie de sessão não expira entre
// tentativas, então não há nada a renovar.
function connectSameOrigin(
    controller: AbortController,
    handlers: StreamHandlers,
    onError: ((error: unknown) => void) | undefined,
): void {
    fetchEventSource(SSE_URL, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
        credentials: "include",
        openWhenHidden: true,
        ...handlers,
        onerror: (err) => {
            onError?.(err)
            if (err instanceof FatalStreamError) {
                throw err
            }
        },
    }).catch((err) => {
        if (controller.signal.aborted) return
        onError?.(err)
    })
}

// Cross-origin (demo do Render, ADR-0010) — cada tentativa de conexão
// precisa de um ticket NOVO (uso único): deixar o fetchEventSource
// reconectar sozinho reaproveitaria a mesma URL com o ticket já consumido, e
// toda reconexão automática falharia com 401. Por isso o loop de reconexão
// é nosso, não da lib — busca um ticket a cada tentativa, e sempre trata
// erro como fatal para ESSA chamada (o loop decide a próxima tentativa, não
// a lib).
async function connectCrossOrigin(
    controller: AbortController,
    handlers: StreamHandlers,
    onError: ((error: unknown) => void) | undefined,
): Promise<void> {
    while (!controller.signal.aborted) {
        try {
            const url = await fetchTicketUrl(controller.signal)
            if (controller.signal.aborted) return

            await fetchEventSource(url, {
                signal: controller.signal,
                headers: { Accept: "text/event-stream" },
                credentials: "include",
                openWhenHidden: true,
                ...handlers,
                onerror: (err) => {
                    throw err
                },
            })
        } catch (err) {
            if (controller.signal.aborted) return
            onError?.(err)
        }

        if (controller.signal.aborted) return
        await wait(RECONNECT_DELAY_MS, controller.signal)
    }
}

export const createAppStream = (options: AppStreamOptions): (() => void) => {
    const controller = new AbortController()
    const handlers = buildHandlers(options)

    if (isCrossOrigin(SSE_URL)) {
        void connectCrossOrigin(controller, handlers, options.onError)
    } else {
        connectSameOrigin(controller, handlers, options.onError)
    }

    return () => {
        controller.abort()
    }
}
