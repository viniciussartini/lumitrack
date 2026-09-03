import { describe, it, expect, beforeAll, afterAll } from "vitest"
import express from "express"
import compression from "compression"
import request from "supertest"
import http, { createServer, type Server } from "http"
import type { AddressInfo } from "net"
import { shouldCompress } from "@/shared/middlewares/compressionFilter.js"

describe("shouldCompress", () => {
    it("retorna false para /api/iot/stream", () => {
        const req = { originalUrl: "/api/iot/stream" } as unknown as express.Request
        expect(shouldCompress(req, {} as express.Response)).toBe(false)
    })

    // O filtro é sempre invocado de dentro do onHeaders do pacote `compression`
    // — no momento em que dispara (res.flushHeaders()/writeHead()), a
    // execução está dentro do sub-router de /api/iot, que reescreve
    // req.path/req.url para o caminho relativo ao seu mount point durante o
    // despacho da rota. req.path aqui valeria "/stream", não
    // "/api/iot/stream" — só req.originalUrl (nunca reescrito) é confiável.
    it("continua retornando false mesmo com req.path já reescrito por um sub-router (mount /api/iot)", () => {
        const req = {
            path: "/stream",
            originalUrl: "/api/iot/stream",
        } as unknown as express.Request
        expect(shouldCompress(req, {} as express.Response)).toBe(false)
    })

    it("NÃO exclui /api/iot/stream-ticket — compartilha o prefixo textual, mas é rota JSON comum, não o stream", () => {
        const req = {
            originalUrl: "/api/iot/stream-ticket",
            headers: { "accept-encoding": "gzip" },
        } as unknown as express.Request
        const res = { getHeader: () => undefined } as unknown as express.Response

        expect(shouldCompress(req, res)).toBe(compression.filter(req, res))
    })

    it("delega ao filtro default do compression para outras rotas", () => {
        const req = {
            originalUrl: "/api/consumption",
            headers: { "accept-encoding": "gzip" },
        } as unknown as express.Request
        const res = { getHeader: () => undefined } as unknown as express.Response

        expect(shouldCompress(req, res)).toBe(compression.filter(req, res))
    })

    it("ignora a query string ao comparar com /api/iot/stream", () => {
        const req = { originalUrl: "/api/iot/stream?ticket=abc123" } as unknown as express.Request
        expect(shouldCompress(req, {} as express.Response)).toBe(false)
    })

    // Segunda barreira, independente do path: o roteador do Express casa
    // rotas sem diferenciar caixa e tolera barra final — nenhuma delas bate
    // na comparação exata de originalUrl, mas ambas chegam à mesma rota SSE
    // e já têm Content-Type: text/event-stream no momento em que o filtro
    // roda (dentro do onHeaders, disparado por flushHeaders()).
    it("retorna false quando o Content-Type já é text/event-stream, mesmo com originalUrl fora do formato esperado", () => {
        const req = { originalUrl: "/API/iot/stream/" } as unknown as express.Request
        const res = {
            getHeader: () => "text/event-stream; charset=utf-8",
        } as unknown as express.Response

        expect(shouldCompress(req, res)).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Prova de comportamento real: um app Express de verdade, servidor TCP real
// (supertest não sustenta streaming — mesmo motivo documentado em
// iot-stream.routes.test.ts), com compression({ filter: shouldCompress })
// montado exatamente como em app.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe("compression({ filter: shouldCompress }) — comportamento real", () => {
    let app: express.Express
    let httpServer: Server
    let serverPort: number

    beforeAll(async () => {
        app = express()
        app.use(compression({ filter: shouldCompress, threshold: 0 }))

        // Monta o stream num sub-router em /api/iot, igual a
        // `app.use("/api/iot", iotStreamRoutes(...))` em app.ts — não
        // direto em `app`. É essa camada extra de roteamento que reescreve
        // req.path/req.url para o caminho relativo ao mount point
        // (`/stream`) enquanto a rota é despachada; testar com a rota
        // montada direto em `app` (sem sub-router) não reproduz isso e
        // deixaria passar um filtro comparando com `req.path`.
        const iotRouter = express.Router()
        iotRouter.get("/stream", (_req, res) => {
            res.setHeader("Content-Type", "text/event-stream")
            res.flushHeaders()

            let count = 0
            const interval = setInterval(() => {
                count += 1
                res.write(`event: tick\ndata: ${count}\n\n`)
                if (count === 3) {
                    clearInterval(interval)
                    res.end()
                }
            }, 30)
        })
        app.use("/api/iot", iotRouter)

        // Payload grande e repetitivo (comprime bem) numa rota comum — prova
        // que o filtro segue comprimindo tudo que não é o stream.
        app.get("/api/consumption", (_req, res) => {
            res.json({ data: "x".repeat(5000) })
        })

        await new Promise<void>((resolve) => {
            httpServer = createServer(app)
            httpServer.listen(0, "127.0.0.1", resolve)
        })
        serverPort = (httpServer.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    })

    it("não comprime /api/iot/stream — sem content-encoding, mesmo pedindo gzip", async () => {
        const response = await request(app)
            .get("/api/iot/stream")
            .set("Accept-Encoding", "gzip")
            .buffer(true)
            .parse((res, callback) => {
                let data = ""
                res.on("data", (chunk: Buffer) => (data += chunk.toString()))
                res.on("end", () => callback(null, data))
            })

        expect(response.headers["content-encoding"]).toBeUndefined()
        expect(response.body).toContain("event: tick")
    })

    it("entrega os chunks do stream aos poucos, não tudo de uma vez ao final", async () => {
        const chunkTimestamps: number[] = []

        const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
            const req = http.get(
                {
                    hostname: "127.0.0.1",
                    port: serverPort,
                    path: "/api/iot/stream",
                    headers: { "Accept-Encoding": "gzip" },
                },
                resolve,
            )
            req.on("error", reject)
        })

        await new Promise<void>((resolve) => {
            stream.on("data", () => chunkTimestamps.push(Date.now()))
            stream.on("end", resolve)
        })

        // 3 chunks escritos a 30ms de intervalo — se a compressão tivesse
        // segurado o buffer, todos chegariam praticamente no mesmo instante
        // (perto do fim), não espaçados ao longo do tempo.
        expect(chunkTimestamps.length).toBeGreaterThanOrEqual(2)
        const totalSpanMs = chunkTimestamps[chunkTimestamps.length - 1]! - chunkTimestamps[0]!
        expect(totalSpanMs).toBeGreaterThan(20)
    })

    it("comprime uma rota comum quando o payload é grande e o cliente aceita gzip", async () => {
        const response = await request(app).get("/api/consumption").set("Accept-Encoding", "gzip")

        expect(response.headers["content-encoding"]).toBe("gzip")
    })
})
