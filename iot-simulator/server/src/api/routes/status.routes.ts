import { Router } from "express"
import type { SimulationStore } from "@/simulation/store.js"

const KEEP_ALIVE_INTERVAL_MS = 30_000

// GET /api/status/stream — SSE, replicando o padrão de
// backend/src/modules/iot/iot-stream.routes.ts, sem autenticação (ferramenta
// local — nunca expor publicamente). O doc pede literalmente "snapshot a
// cada mudança": reenvia o snapshot completo, não um diff.
export function statusRoutes(store: SimulationStore): Router {
    const router = Router()

    router.get("/stream", (req, res) => {
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        function sendSnapshot(): void {
            res.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`)
        }

        sendSnapshot()
        store.on("changed", sendSnapshot)

        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
        }, KEEP_ALIVE_INTERVAL_MS)

        req.on("close", () => {
            store.off("changed", sendSnapshot)
            clearInterval(keepAlive)
        })
    })

    return router
}
