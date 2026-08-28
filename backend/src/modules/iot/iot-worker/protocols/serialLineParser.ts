// ─────────────────────────────────────────────────────────────────────────────
// SerialLineParser — remonta linhas a partir de chunks parciais de um stream
// serial orientado a evento (RS-232/RS-485: o dispositivo envia dados quando
// tem algo a reportar, sem ser interrogado — diferente do Modbus, que é
// request/response).
//
// Compartilhado entre Rs232Connection e Rs485Connection — a única diferença
// entre os dois protocolos nesse ponto é o formato do fallback quando a
// linha não é JSON válido (buildRawFallback) e o rótulo usado no log de
// overflow (moduleTag).
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "@/shared/logger/logger.js"

// Teto do buffer de linhas serial — um dispositivo que nunca envie "\n"
// faria o buffer crescer sem limite a cada chunk recebido, vetor de
// exaustão de memória. Ao estourar, o buffer acumulado (sem terminador
// válido até aqui) é descartado — perder um fragmento de um dispositivo
// que nunca fecha linha é preferível a reter memória indefinidamente por ele.
const SERIAL_LINE_BUFFER_MAX_BYTES = 64 * 1024

export interface SerialLineParserOptions {
    meterId: string
    moduleTag: string
    onLine: (parsed: Record<string, unknown>) => void
    buildRawFallback: (trimmed: string) => Record<string, unknown>
}

export class SerialLineParser {
    buffer = ""

    constructor(private readonly options: SerialLineParserOptions) {}

    // Chamado no disconnect() da conexão — descarta qualquer fragmento de
    // linha incompleta acumulado, para uma reconexão futura não misturar
    // bytes de sessões diferentes.
    reset(): void {
        this.buffer = ""
    }

    feed(chunk: Buffer): void {
        this.buffer += chunk.toString()

        if (this.buffer.length > SERIAL_LINE_BUFFER_MAX_BYTES) {
            logger.error(
                {
                    module: this.options.moduleTag,
                    meterId: this.options.meterId,
                    bufferLength: this.buffer.length,
                },
                "Buffer serial excedeu o teto sem encontrar terminador de linha — descartado",
            )
            this.buffer = ""
            return
        }

        const lines = this.buffer.split("\n")
        this.buffer = lines.pop() ?? ""

        for (const line of lines) {
            const trimmed = line.trim()

            if (!trimmed) {
                continue
            }

            try {
                const parsed = JSON.parse(trimmed) as Record<string, unknown>
                this.options.onLine(parsed)
            } catch {
                this.options.onLine(this.options.buildRawFallback(trimmed))
            }
        }
    }
}
