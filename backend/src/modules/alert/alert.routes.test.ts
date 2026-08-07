import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validAlertBody = {
    name: "Pico de potência",
    referencePowerKw: 10,
    tolerancePercent: 2,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

// Cria user → distribuidora (catálogo) → property → medidor (via API real).
async function setupUserWithMeter(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })

    const meterRes = await request(app)
        .post("/api/meters")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: propRes.body.data.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "t",
        })

    return {
        token,
        propertyId: propRes.body.data.id as string,
        meterId: meterRes.body.data.id as string,
    }
}

async function createAlert(
    token: string,
    meterId: string,
    body: Record<string, unknown> = validAlertBody,
) {
    const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...body, meterId })
    return res.body.data as { id: string }
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/alerts", () => {
    it("deve criar um alerta e retornar 201", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const response = await request(app)
            .post("/api/alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAlertBody, meterId })

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.meterId).toBe(meterId)
        expect(response.body.data.name).toBe("Pico de potência")
        expect(response.body.data.enabled).toBe(true)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).post("/api/alerts").send(validAlertBody)
        expect(response.status).toBe(401)
    })

    it("deve retornar 404 para meterId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAlertBody, meterId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao vincular medidor de outro usuário", async () => {
        const { meterId } = await setupUserWithMeter(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/alerts")
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ ...validAlertBody, meterId })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para nome vazio", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const response = await request(app)
            .post("/api/alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAlertBody, meterId, name: "" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para tolerancePercent acima de 100", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const response = await request(app)
            .post("/api/alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAlertBody, meterId, tolerancePercent: 150 })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/alerts", () => {
    it("deve retornar 200 com envelope paginado vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/alerts")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar os alertas do usuário com status e target", async () => {
        const { token, meterId, propertyId } = await setupUserWithMeter()
        await createAlert(token, meterId)

        const response = await request(app)
            .get("/api/alerts")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].status).toBe("normal")
        expect(response.body.data.items[0].target).toEqual({
            type: "PROPERTY",
            name: "Casa",
            path: `/propriedades/${propertyId}`,
        })
    })

    it("deve retornar apenas os alertas do usuário autenticado", async () => {
        const { token: tokenA, meterId: meterIdA } = await setupUserWithMeter(validUser)
        const { token: tokenB, meterId: meterIdB } = await setupUserWithMeter(anotherUser)
        await createAlert(tokenA, meterIdA)
        await createAlert(tokenB, meterIdB, { ...validAlertBody, name: "Alerta B" })

        const response = await request(app)
            .get("/api/alerts")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].name).toBe("Pico de potência")
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/alerts")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/firing
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/alerts/firing", () => {
    it("deve retornar 200 com lista vazia quando não há evaluator configurado", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/alerts/firing")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/alerts/firing")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/alerts/:id", () => {
    it("deve retornar 200 com os dados do alerta", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .get(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(alert.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithMeter(validUser)
        const alert = await createAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/alerts/:id", () => {
    it("deve atualizar o alerta e retornar 200", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .put(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Renomeado", referencePowerKw: 15 })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Renomeado")
        expect(response.body.data.referencePowerKw).toBe(15)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .put("/api/alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao atualizar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithMeter(validUser)
        const alert = await createAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para dados inválidos", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .put(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ tolerancePercent: -1 })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alerts/:id/enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/alerts/:id/enabled", () => {
    it("deve alternar enabled e retornar 200", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .patch(`/api/alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${token}`)
            .send({ enabled: false })

        expect(response.status).toBe(200)
        expect(response.body.data.enabled).toBe(false)
    })

    it("deve retornar 422 quando enabled não é booleano", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .patch(`/api/alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${token}`)
            .send({ enabled: "não" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 403 para alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithMeter(validUser)
        const alert = await createAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .patch(`/api/alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ enabled: false })

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/alerts/:id", () => {
    it("deve deletar o alerta e retornar 204", async () => {
        const { token, meterId } = await setupUserWithMeter()
        const alert = await createAlert(token, meterId)

        const response = await request(app)
            .delete(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao deletar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithMeter(validUser)
        const alert = await createAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .delete("/api/alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/alerts/00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })
})
