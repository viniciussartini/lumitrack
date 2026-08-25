import type { Request, Response } from "express"
import compression from "compression"

/**
 * Filtro de compressão HTTP (A-05, Fase 15) — nunca comprime o stream SSE de
 * ingestão IoT: o buffer de compressão do gzip/brotli segura os chunks até
 * acumular dado suficiente para emitir um bloco, o que quebraria a entrega
 * em tempo real do stream (o cliente pararia de receber evento a evento).
 * Para toda outra rota, delega ao filtro default do `compression` — respeita
 * `Accept-Encoding`, o `Content-Type` da resposta e o limiar de tamanho.
 *
 * @param req - Requisição em curso.
 * @param res - Resposta em curso.
 * @returns `false` para `/api/iot/stream`; caso contrário, o filtro default.
 */
export function shouldCompress(req: Request, res: Response): boolean {
    if (req.path.startsWith("/api/iot/stream")) {
        return false
    }

    return compression.filter(req, res)
}
