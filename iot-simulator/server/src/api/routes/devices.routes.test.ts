import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createApp } from "@/api/app.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

// /api/devices exige Authorization desde a issue #180 — token fixo de
// teste, injetado via apiToken (não depende do env.SIMULATOR_API_TOKEN).
const API_TOKEN = "token-de-teste-para-rotas-protegidas"

function createFakePublisher(): InternalPublisher {
    return {
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        publish: vi.fn(),
        isConnected: () => true,
    }
}

async function createTestAppWithDevice() {
    const store = new SimulationStore()
    const engine = new SimulationEngine(store, createFakePublisher())
    const app = createApp({ store, engine, apiToken: API_TOKEN })

    const network = store.createNetwork("Casa Teste")
    const device = store.createDevice(network.id, { name: "Medidor 1", topic: "sim/dev1" })!

    return { app, store, engine, device }
}

function authed(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${API_TOKEN}`)
}

describe("devicesRoutes", () => {
    it("POST /api/devices/:id/power em device inexistente retorna 404", async () => {
        const { app } = await createTestAppWithDevice()
        const res = await authed(request(app).post("/api/devices/id-inexistente/power")).send({
            on: true,
        })
        expect(res.status).toBe(404)
    })

    it("POST /api/devices/:id/power sem token retorna 401", async () => {
        const { app, device } = await createTestAppWithDevice()
        const res = await request(app).post(`/api/devices/${device.id}/power`).send({ on: true })
        expect(res.status).toBe(401)
    })

    it("POST /api/devices/:id/power liga o device", async () => {
        const { app, store, device } = await createTestAppWithDevice()
        const res = await authed(request(app).post(`/api/devices/${device.id}/power`)).send({
            on: true,
        })

        expect(res.status).toBe(200)
        expect(store.getDevice(device.id)?.poweredOn).toBe(true)
    })

    it("POST /api/devices/:id/anomaly sem body usa defaults (multiplier:3, durationSeconds:30)", async () => {
        const { app, store, device } = await createTestAppWithDevice()
        const res = await authed(request(app).post(`/api/devices/${device.id}/anomaly`)).send()

        expect(res.status).toBe(200)
        const updated = store.getDevice(device.id)!
        expect(updated.anomaly.active).toBe(true)
        expect(updated.anomaly.multiplier).toBe(3)
    })

    it("DELETE /api/devices/:id/anomaly desativa a anomalia", async () => {
        const { app, store, device } = await createTestAppWithDevice()
        await authed(request(app).post(`/api/devices/${device.id}/anomaly`)).send()

        const res = await authed(request(app).delete(`/api/devices/${device.id}/anomaly`))

        expect(res.status).toBe(200)
        expect(store.getDevice(device.id)?.anomaly.active).toBe(false)
    })

    it("PATCH /api/devices/:id atualiza name/topic/params", async () => {
        const { app, device } = await createTestAppWithDevice()
        const res = await authed(request(app).patch(`/api/devices/${device.id}`)).send({
            name: "Medidor Renomeado",
        })

        expect(res.status).toBe(200)
        expect(res.body.name).toBe("Medidor Renomeado")
    })

    it("DELETE /api/devices/:id remove o device e para o runner", async () => {
        const { app, store, device } = await createTestAppWithDevice()
        const res = await authed(request(app).delete(`/api/devices/${device.id}`))

        expect(res.status).toBe(204)
        expect(store.getDevice(device.id)).toBeUndefined()
    })
})
