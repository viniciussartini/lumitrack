import type { Request, Response } from "express"
import compression from "compression"

/**
 * Filtro de compressão HTTP — nunca comprime o stream SSE de ingestão IoT: o
 * buffer de compressão do gzip/brotli segura os chunks até acumular dado
 * suficiente para emitir um bloco, o que quebraria a entrega em tempo real
 * do stream (o cliente pararia de receber evento a evento). Para toda outra
 * rota, delega ao filtro default do `compression` — respeita
 * `Accept-Encoding`, o `Content-Type` da resposta e o limiar de tamanho.
 *
 * `req.originalUrl`, não `req.path`: o `compression` do pacote npm só invoca
 * este filtro dentro de um hook `onHeaders` (via `on-headers`), disparado
 * quando a rota chama `res.flushHeaders()`/`res.writeHead()` — nesse
 * instante a execução ainda está "dentro" do sub-router de `/api/iot`
 * (`iotStreamRoutes`), que reescreve `req.url`/`req.path` para o caminho
 * relativo ao seu próprio mount point (`/stream`, sem o prefixo `/api/iot`)
 * enquanto despacha a rota. Comparar com `req.path` nunca dava match — o
 * filtro sempre caía no `compression.filter` default, que comprime porque
 * `Accept-Encoding` está sempre presente num navegador real, e o buffer de
 * zlib segura os poucos bytes de cada leitura até fechar um bloco, que para
 * uma amostra por segundo nunca acontece: nenhum dado chega ao cliente.
 * `req.originalUrl` nunca é reescrito pelo roteamento, então reflete o
 * caminho completo (`/api/iot/stream`) em qualquer ponto da cadeia.
 *
 * Comparação exata (não `startsWith`) de propósito: `/api/iot/stream-ticket`
 * é uma rota JSON comum que só compartilha o prefixo textual, não um
 * sub-caminho do stream — `startsWith` a excluiria por engano.
 *
 * @param req - Requisição em curso.
 * @param res - Resposta em curso.
 * @returns `false` para `/api/iot/stream`; caso contrário, o filtro default.
 */
export function shouldCompress(req: Request, res: Response): boolean {
    const path = req.originalUrl.split("?")[0]
    if (path === "/api/iot/stream") {
        return false
    }

    return compression.filter(req, res)
}
