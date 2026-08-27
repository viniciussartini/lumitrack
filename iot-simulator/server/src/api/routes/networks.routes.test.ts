import { describe, it, expect, beforeEach, vi } from "vitest"
import request from "supertest"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createApp } from "@/api/app.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

// /api/networks exige Authorization — token fixo de teste, injetado via
// apiToken (não depende do env.SIMULATOR_API_TOKEN).
const API_TOKEN = "token-de-teste-para-rotas-protegidas"

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
    const app = createApp({ store, engine, apiToken: API_TOKEN })
    return { app, store, engine }
}

function authed(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${API_TOKEN}`)
}

describe("networksRoutes", () => {
    let app: ReturnType<typeof createTestApp>["app"]

    beforeEach(() => {
        ;({ app } = createTestApp())
    })

    it("POST /api/networks sem name retorna 422 com issues.name", async () => {
        const res = await authed(request(app).post("/api/networks")).send({})

        expect(res.status).toBe(422)
        expect(res.body.issues.name).toBeDefined()
    })

    it("POST /api/networks sem token retorna 401", async () => {
        const res = await request(app).post("/api/networks").send({ name: "Casa Teste" })
        expect(res.status).toBe(401)
    })

    it("POST /api/networks válido retorna 201 com id e devices como array vazio", async () => {
        const res = await authed(request(app).post("/api/networks")).send({ name: "Casa Teste" })

        expect(res.status).toBe(201)
        expect(res.body.id).toBeDefined()
        expect(res.body.name).toBe("Casa Teste")
        // Regressão: `network.devices` é um Map internamente — serializar o
        // objeto cru faz `devices` virar `{}` em vez de `[]` no JSON.
        expect(res.body.devices).toEqual([])
    })

    it("GET /api/networks lista as redes criadas", async () => {
        await authed(request(app).post("/api/networks")).send({ name: "Casa Teste" })
        const res = await authed(request(app).get("/api/networks"))

        expect(res.status).toBe(200)
        expect(res.body).toHaveLength(1)
        expect(res.body[0].name).toBe("Casa Teste")
    })

    it("DELETE /api/networks/:id em rede inexistente retorna 404", async () => {
        const res = await authed(request(app).delete("/api/networks/id-inexistente"))
        expect(res.status).toBe(404)
    })

    it("POST /api/networks/:id/devices com networkId inexistente retorna 404", async () => {
        const res = await authed(request(app).post("/api/networks/id-inexistente/devices")).send({
            name: "Medidor 1",
            topic: "sim/dev1",
        })

        expect(res.status).toBe(404)
    })

    it("POST /api/networks/:id/devices válido retorna 201 e aparece em GET /:id/devices", async () => {
        const created = await authed(request(app).post("/api/networks")).send({
            name: "Casa Teste",
        })
        const networkId = created.body.id

        const res = await authed(request(app).post(`/api/networks/${networkId}/devices`)).send({
            name: "Medidor 1",
            topic: "sim/dev1",
        })

        expect(res.status).toBe(201)
        expect(res.body.topic).toBe("sim/dev1")

        const listRes = await authed(request(app).get(`/api/networks/${networkId}/devices`))
        expect(listRes.status).toBe(200)
        expect(listRes.body).toHaveLength(1)
    })
})
