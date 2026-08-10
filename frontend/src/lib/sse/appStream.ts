import {
    fetchEventSource,
    EventStreamContentType,
    type EventSourceMessage,
} from "@microsoft/fetch-event-source"
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
 * na API — cookie de sessão em produção usa sameSite:"none" exatamente
 * para permitir isso (shared/security/csrf.ts).
 */
const SSE_URL = import.meta.env.VITE_SSE_URL || "/api/iot/stream"

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
export const createAppStream = ({
    onConnected,
    onReading,
    onAlertFiring,
    onNotification,
    onError,
    onOpen,
}: AppStreamOptions): (() => void) => {
    const controller = new AbortController()

    fetchEventSource(SSE_URL, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
        credentials: "include",
        openWhenHidden: true,

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

        onmessage: (event: EventSourceMessage) => {
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

    return () => {
        controller.abort()
    }
}
