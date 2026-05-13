import {
    fetchEventSource,
    EventStreamContentType,
    type EventSourceMessage,
} from "@microsoft/fetch-event-source"
import type { Alert } from "@/types/alert.types"

/**
 * URL do endpoint SSE do backend.
 *
 * O backend monta `iotRoutes` em /api/iot, e dentro dele `GET /stream` é o
 * Server-Sent Events. Por isso /api/iot/stream — exatamente como
 * documentado em alert/iot/stream.
 */
const SSE_URL = "/api/iot/stream"

/**
 * Eventos emitidos pelo backend (ver alert-notifier.ts + iot.controller.ts):
 *
 *   event: connected   → payload { deviceCount: number }    (não usamos)
 *   event: reading     → payload { deviceId, kwhConsumed }  (leituras IoT — não usamos)
 *   event: alert       → payload AlertResponse completo     ← ESTE
 *
 * Eventos sem nome ("message" implícito) são keep-alive — `:` comments
 * cada 30s. A lib `@microsoft/fetch-event-source` ignora comments
 * automaticamente.
 */
const EVENT_ALERT = "alert"

/**
 * Opções pra `createAlertStream`.
 */
export interface AlertStreamOptions {
    /** Token JWT pra Authorization header. */
    token: string

    /** Callback disparado quando o backend emite um evento `alert`. */
    onAlert: (alert: Alert) => void

    /**
     * Callback de erro. Disparado quando:
     *   - Status HTTP inicial != 200
     *   - Conteúdo-tipo da resposta não é text/event-stream
     *   - Parsing do payload JSON falha (não-fatal — registra mas continua)
     *
     * O stream NÃO é abortado em onError — `@microsoft/fetch-event-source`
     * tenta reconectar automaticamente. Para abortar definitivamente,
     * chame o cleanup retornado por `createAlertStream`.
     */
    onError?: (error: unknown) => void

    /**
     * Callback quando o stream conecta (status 200 + content-type correto).
     * Útil pra logging ou indicador visual de "conectado".
     */
    onOpen?: () => void
}

/**
 * Sentinela: erro lançado pelo onopen quando a resposta inicial é
 * inválida. `fetch-event-source` trata como fatal e NÃO retenta.
 *
 * Usamos pra distinguir falha de autenticação (token revogado/expirado)
 * de falha transitória de rede — a primeira é "morte" do stream, a
 * segunda é um soluço que a lib resolve sozinha.
 */
class FatalStreamError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "FatalStreamError"
    }
}

/**
 * Abre uma conexão SSE com o backend pra receber alertas em tempo real.
 *
 * Retorna uma função de cleanup que aborta a conexão. Chame-a quando o
 * componente desmontar OU quando o usuário deslogar.
 *
 * Por que `@microsoft/fetch-event-source` e não o `EventSource` nativo:
 *   - EventSource nativo NÃO suporta headers customizados (CORS limit).
 *   - Não conseguiríamos enviar Authorization: Bearer.
 *   - Mudar o backend pra aceitar token via query param espalha JWT em
 *     logs de proxy/nginx — má prática.
 *   - fetch-event-source usa fetch() por baixo, então headers funcionam
 *     naturalmente.
 *
 * Por que `openWhenHidden: true`:
 *   - O default da lib pausa o stream quando a aba fica oculta (background).
 *   - Pra alertas em tempo real, queremos receber MESMO se a aba estiver em
 *     background — o badge no Header é justamente pra ser visto quando a
 *     pessoa volta pra aba.
 *
 * Como testar isso manualmente:
 *   1. Abra /alertas em uma aba autenticada
 *   2. Em outra aba ou via curl: crie um consumo que ultrapasse algum threshold
 *   3. Veja o toast aparecer + o badge no header incrementar
 */
export const createAlertStream = ({
    token,
    onAlert,
    onError,
    onOpen,
}: AlertStreamOptions): (() => void) => {
    const controller = new AbortController()

    fetchEventSource(SSE_URL, {
        signal: controller.signal,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
        },
        openWhenHidden: true,

        onopen: async (response) => {
            if (
                response.ok &&
                response.headers
                    .get("content-type")
                    ?.startsWith(EventStreamContentType)
            ) {
                onOpen?.()
                return
            }
            // Status != 200 ou content-type errado — provavelmente 401
            // (token revogado/expirado) ou 5xx persistente. Lança erro
            // FATAL para a lib NÃO retentar indefinidamente.
            throw new FatalStreamError(
                `SSE failed to open: HTTP ${response.status}`,
            )
        },

        onmessage: (event: EventSourceMessage) => {
            if (event.event !== EVENT_ALERT) {
                // Ignora 'connected', 'reading', e qualquer outro evento.
                // Só nos importa 'alert' nesta camada.
                return
            }

            try {
                const alert = JSON.parse(event.data) as Alert
                onAlert(alert)
            } catch (parseError) {
                // Mensagem com JSON inválido — registra mas não aborta.
                // A próxima mensagem deve voltar a funcionar.
                onError?.(parseError)
            }
        },

        onerror: (err) => {
            onError?.(err)

            // Se o erro é fatal (do onopen), re-lança pra a lib parar de
            // tentar reconectar. Pra erros transitórios (network blip),
            // retornar void faz a lib retentar automaticamente após delay.
            if (err instanceof FatalStreamError) {
                throw err
            }
        },
    }).catch((err) => {
        // fetchEventSource rejeita a promise quando o stream termina
        // definitivamente (abort intencional OU erro fatal não-tratado).
        // Em ambos os casos, não há o que fazer aqui — onError já foi
        // chamado. Engolimos pra não vazar unhandled rejection.
        if (controller.signal.aborted) return // Abort intencional
        onError?.(err)
    })

    return () => {
        controller.abort()
    }
}