import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createApp } from "@/api/app.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"

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
    return createApp({ store, engine, apiToken: API_TOKEN })
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

    // Issue #180 — perímetro mínimo do simulador.
    describe("perímetro de segurança", () => {
        it("aplica helmet (ex.: x-content-type-options) em toda resposta", async () => {
            const res = await request(createTestApp()).get("/health")
            expect(res.headers["x-content-type-options"]).toBe("nosniff")
        })

        it("GET /health e /api/broker/info continuam acessíveis sem token", async () => {
            const app = createTestApp()
            const health = await request(app).get("/health")
            const brokerInfo = await request(app).get("/api/broker/info")

            expect(health.status).toBe(200)
            expect(brokerInfo.status).toBe(200)
        })

        it("POST /api/networks sem Authorization retorna 401", async () => {
            const res = await request(createTestApp())
                .post("/api/networks")
                .send({ name: "Casa Teste" })

            expect(res.status).toBe(401)
        })

        it("POST /api/networks com token errado retorna 401", async () => {
            const res = await request(createTestApp())
                .post("/api/networks")
                .set("Authorization", "Bearer token-errado")
                .send({ name: "Casa Teste" })

            expect(res.status).toBe(401)
        })

        it("POST /api/networks com o token correto passa pela autenticação", async () => {
            const res = await request(createTestApp())
                .post("/api/networks")
                .set("Authorization", `Bearer ${API_TOKEN}`)
                .send({ name: "Casa Teste" })

            expect(res.status).toBe(201)
        })

        it("PATCH /api/devices/:id sem Authorization retorna 401 (não 404)", async () => {
            // Confirma que o token é checado antes de qualquer lookup de
            // recurso — um 404 aqui vazaria se o id existe ou não sem provar
            // identidade.
            const res = await request(createTestApp())
                .patch("/api/devices/id-qualquer")
                .send({ name: "x" })

            expect(res.status).toBe(401)
        })
    })
})
