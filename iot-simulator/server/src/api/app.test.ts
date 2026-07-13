import { describe, it, expect, vi } from "vitest"
import request from "supertest"
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

function createTestApp() {
    const store = new SimulationStore()
    const engine = new SimulationEngine(store, createFakePublisher())
    return createApp({ store, engine })
}

describe("createApp", () => {
    it("GET /health retorna status ok", async () => {
        const res = await request(createTestApp()).get("/health")
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: "ok" })
    })

    it("GET /api/broker/info retorna host/port do broker configurado", async () => {
        const res = await request(createTestApp()).get("/api/broker/info")
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ host: "localhost", port: 1883 })
    })
})
