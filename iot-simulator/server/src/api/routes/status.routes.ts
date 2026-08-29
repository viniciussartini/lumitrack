import { Router, type Response } from "express"
import type { SimulationStore } from "@/simulation/store.js"

const KEEP_ALIVE_INTERVAL_MS = 30_000

// GET /api/status/stream — SSE, replicando o padrão de
// backend/src/modules/iot/iot-stream.routes.ts, sem autenticação (ferramenta
// local — nunca expor publicamente). O doc pede literalmente "snapshot a
// cada mudança": reenvia o snapshot completo, não um diff.
export function statusRoutes(store: SimulationStore): Router {
    const router = Router()

    // Compartilhado entre TODAS as conexões (não um listener por cliente,
    // como antes) — um único "changed" do store monta e serializa o
    // snapshot UMA vez (O(D)), e essa mesma string é escrita para os C
    // clientes conectados (O(C)). Antes, cada cliente tinha seu próprio
    // listener reconstruindo e serializando o snapshot inteiro por conta
    // própria a cada "changed" (O(D) × C).
    const clients = new Set<Response>()

    function broadcastSnapshot(): void {
        if (clients.size === 0) return
        const chunk = `event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`
        for (const res of clients) {
            res.write(chunk)
        }
    }

    store.on("changed", broadcastSnapshot)

    router.get("/stream", (req, res) => {
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        // Snapshot inicial é individual (não compartilhável) — quem acabou
        // de conectar precisa do estado atual já, sem esperar o próximo
        // "changed".
        res.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`)
        clients.add(res)

        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
        }, KEEP_ALIVE_INTERVAL_MS)

        req.on("close", () => {
            clients.delete(res)
            clearInterval(keepAlive)
        })
    })

    return router
}
