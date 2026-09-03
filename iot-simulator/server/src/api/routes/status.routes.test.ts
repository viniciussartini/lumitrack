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

    it("coalesce múltiplos devices atualizando no mesmo tick numa única notificação por cliente (issue #312)", async () => {
        const store = new SimulationStore()
        const engine = new SimulationEngine(store, createFakePublisher())
        const app = createApp({ store, engine })

        const network = store.createNetwork("Rede Teste")
        const deviceIds = ["d1", "d2", "d3"].map(
            (name) => store.createDevice(network.id, { name, topic: `sim/${name}` })!.id,
        )

        const port = await new Promise<number>((resolve) => {
            server = app.listen(0, () => {
                const address = server!.address()
                resolve(typeof address === "object" && address !== null ? address.port : 0)
            })
        })

        // Conecta 2 clientes (C=2) ANTES da rajada — cada um só resolve
        // depois de receber o primeiro chunk (o snapshot inicial), pra não
        // contar esse chunk junto com os disparados pela rajada abaixo.
        function openStreamAndWaitFirstChunk(): Promise<{ buffer: string[]; destroy: () => void }> {
            return new Promise((resolve, reject) => {
                const buffer: string[] = []
                const req = httpGet(`http://localhost:${port}/api/status/stream`, (res) => {
                    res.setEncoding("utf8")
                    res.once("data", (chunk: string) => {
                        buffer.push(chunk)
                        resolve({ buffer, destroy: () => req.destroy() })
                    })
                    res.on("data", (chunk: string) => buffer.push(chunk))
                })
                req.once("error", reject)
            })
        }

        const [clientA, clientB] = await Promise.all([
            openStreamAndWaitFirstChunk(),
            openStreamAndWaitFirstChunk(),
        ])
        clientA.buffer.length = 0
        clientB.buffer.length = 0

        // D=3 devices "publicando" no mesmo tick — chamadas síncronas, sem
        // await entre elas, simulando 3 DeviceRunner.tick() disparando na
        // mesma volta do event loop (mesmo período de setInterval).
        for (const deviceId of deviceIds) {
            store.recordSample(
                deviceId,
                { voltage: 220, current: 1, powerW: 220, powerFactor: 1 },
                Date.now(),
            )
        }

        // A notificação coalescida só dispara depois de um setImmediate —
        // espera 1 volta extra do event loop, mais uma folga pro res.write()
        // chegar no cliente.
        await new Promise<void>((resolve) => setImmediate(resolve))
        await new Promise<void>((resolve) => setTimeout(resolve, 30))

        clientA.destroy()
        clientB.destroy()

        const countSnapshotEvents = (buffer: string[]): number =>
            (buffer.join("").match(/event: snapshot/g) ?? []).length

        // 1 notificação por cliente para as 3 amostras da rajada, não 3.
        expect(countSnapshotEvents(clientA.buffer)).toBe(1)
        expect(countSnapshotEvents(clientB.buffer)).toBe(1)
    })
})
