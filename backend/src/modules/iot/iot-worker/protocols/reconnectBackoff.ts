// ─────────────────────────────────────────────────────────────────────────────
// reconnectBackoff — reconexão automática com backoff exponencial, acionada
// quando um adaptador detecta que o transporte caiu depois de já ter
// conectado (polling ficando "não saudável" via PollingLoop, ou o próprio
// evento de close/error do transporte nos protocolos orientados a evento).
//
// Antes desta issue, nenhum adaptador reconectava sozinho — uma queda de
// rede/dispositivo exigia reiniciar o processo ou chamar restart() na mão.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "@/shared/logger/logger.js"

export interface ReconnectBackoffOptions {
    meterId: string
    moduleTag: string
    reconnect: () => Promise<void>
    // Interrompe as tentativas — true depois de um disconnect() intencional,
    // para uma reconexão em andamento não reviver uma conexão que o usuário
    // pediu para parar.
    isStopped: () => boolean
    baseDelayMs?: number
    maxDelayMs?: number
}

// Delay = min(baseDelayMs × 2^(tentativa-1), maxDelayMs). Tentativa 1 = delay
// base (ex.: 1s), dobrando a cada falha até o teto (ex.: 30s) — evita tanto
// martelar um dispositivo temporariamente fora do ar quanto esperar tempo
// demais para retomar um que já voltou.
export function scheduleReconnect(options: ReconnectBackoffOptions): void {
    const baseDelayMs = options.baseDelayMs ?? 1000
    const maxDelayMs = options.maxDelayMs ?? 30_000
    let attempt = 0

    const attemptReconnect = (): void => {
        if (options.isStopped()) {
            return
        }

        attempt += 1
        const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)

        setTimeout(() => {
            if (options.isStopped()) {
                return
            }

            options.reconnect().catch((err: unknown) => {
                logger.error(
                    { module: options.moduleTag, meterId: options.meterId, attempt, err },
                    "Tentativa de reconexão falhou",
                )
                attemptReconnect()
            })
        }, delayMs)
    }

    attemptReconnect()
}
