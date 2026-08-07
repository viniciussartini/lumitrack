import { describe, it, expect, afterEach, vi } from "vitest"
import { get as httpGet } from "http"
import type { Server } from "http"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createApp } from "@/api/app.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

function createFakePublisher(): InternalPublisher {
    return {
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        publish: vi.fn(),
        isConnected: () => true,
    }
}

describe("statusRoutes — GET /api/status/stream", () => {
    let server: Server | undefined

    afterEach(async () => {
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
        server = undefined
    })

    it("responde com content-type text/event-stream e o primeiro chunk é o snapshot", async () => {
        const store = new SimulationStore()
        const engine = new SimulationEngine(store, createFakePublisher())
        const app = createApp({ store, engine })

        const port = await new Promise<number>((resolve) => {
            server = app.listen(0, () => {
                const address = server!.address()
                resolve(typeof address === "object" && address !== null ? address.port : 0)
            })
        })

        const { contentType, firstChunk } = await new Promise<{
            contentType: string | undefined
            firstChunk: string
        }>((resolve, reject) => {
            let firstChunkReceived = false

            const req = httpGet(`http://localhost:${port}/api/status/stream`, (res) => {
                res.once("data", (chunk: Buffer) => {
                    firstChunkReceived = true
                    resolve({
                        contentType: res.headers["content-type"],
                        firstChunk: chunk.toString(),
                    })
                    req.destroy()
                })
            })
            req.once("error", (err) => {
                // A conexão é destruída propositalmente após o primeiro chunk —
                // ignora o ECONNRESET resultante disso.
                if (!firstChunkReceived) reject(err)
            })
        })

        expect(contentType).toContain("text/event-stream")
        expect(firstChunk).toContain("event: snapshot")
    })
})
