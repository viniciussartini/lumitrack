import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validDistributorBody = {
    name: "CEMIG",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
}

const validAlertBody = {
    thresholdKwh: 100,
    message: "Consumo alto",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "WEB",
    })
    return res.body.data.token as string
}

async function setupFull(user = validUser) {
    const token = await registerAndLogin(user)

    const distRes = await request(app)
        .post("/api/distributors")
        .set("Authorization", `Bearer ${token}`)
        .send(validDistributorBody)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distRes.body.data.id })

    const areaRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Sala" })

    const deviceRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas/${areaRes.body.data.id}/devices`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ar-condicionado", powerWatts: 1200 })

    return {
        token,
        propertyId: propRes.body.data.id as string,
        areaId: areaRes.body.data.id as string,
        deviceId: deviceRes.body.data.id as string,
    }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/alerts", () => {
    it("deve criar alerta para property e retornar 201", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)

        expect(response.status).toBe(201)
        expect(response.body.data.propertyId).toBe(propertyId)
        expect(response.body.data.targetType).toBe("PROPERTY")
        expect(response.body.data.thresholdKwh).toBe(100)
        expect(response.body.data.triggeredAt).toBeNull()
    })

    it("deve retornar 403 para property de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validAlertBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para thresholdKwh zero", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: 0 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/00000000-0000-0000-0000-000000000000/alerts")
            .send(validAlertBody)

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:propertyId/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/alerts", () => {
    it("deve retornar 200 com alertas da property", async () => {
        const { token, propertyId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/alerts")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/areas/:areaId/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas/:areaId/alerts", () => {
    it("deve criar alerta para area e retornar 201", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)

        expect(response.status).toBe(201)
        expect(response.body.data.areaId).toBe(areaId)
        expect(response.body.data.targetType).toBe("AREA")
    })

    it("deve retornar 403 para area de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/alerts`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validAlertBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/p/areas/a/alerts")
            .send(validAlertBody)

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts", () => {
    it("deve criar alerta para device e retornar 201", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)

        expect(response.status).toBe(201)
        expect(response.body.data.deviceId).toBe(deviceId)
        expect(response.body.data.targetType).toBe("DEVICE")
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/alerts`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validAlertBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/p/areas/a/devices/d/alerts")
            .send(validAlertBody)

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts — listagem global
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/alerts", () => {
    it("deve retornar todos os alertas do usuário", async () => {
        const { token, propertyId, areaId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: 50 })

        const response = await request(app)
            .get("/api/alerts")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(2)
    })

    it("deve filtrar alertas disparados com ?triggered=true", async () => {
        const { token, propertyId } = await setupFull()

        // Cria alerta com threshold baixo e registra consumo acima dele
        await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: 5 })

        // Threshold alto — não será disparado
        await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: 9999 })

        // Registra consumo de 10 kWh → dispara alerta com threshold 5
        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 10 })

        const response = await request(app)
            .get("/api/alerts?triggered=true")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
        expect(response.body.data[0].triggeredAt).not.toBeNull()
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/alerts")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/alerts/:id", () => {
    it("deve atualizar thresholdKwh e message e retornar 200", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string

        const response = await request(app)
            .put(`/api/alerts/${alertId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: 250, message: "Novo limite" })

        expect(response.status).toBe(200)
        expect(response.body.data.thresholdKwh).toBe(250)
        expect(response.body.data.message).toBe("Novo limite")
    })

    it("deve retornar 403 ao atualizar alerta de outro usuário", async () => {
        const { token, propertyId } = await setupFull(validUser)
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/alerts/${alertId}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ thresholdKwh: 999 })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para thresholdKwh negativo", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string

        const response = await request(app)
            .put(`/api/alerts/${alertId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdKwh: -1 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/alerts/00000000-0000-0000-0000-000000000000")
            .send({ thresholdKwh: 100 })

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alerts/:id/read
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/alerts/:id/read", () => {
    it("deve preencher readAt e retornar 200", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string

        const response = await request(app)
            .patch(`/api/alerts/${alertId}/read`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.readAt).not.toBeNull()
    })

    it("deve retornar 403 ao marcar alerta de outro usuário como lido", async () => {
        const { token, propertyId } = await setupFull(validUser)
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .patch(`/api/alerts/${alertId}/read`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .patch("/api/alerts/00000000-0000-0000-0000-000000000000/read")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/alerts/:id", () => {
    it("deve deletar o alerta e retornar 204", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string

        const response = await request(app)
            .delete(`/api/alerts/${alertId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
    })

    it("deve retornar 403 ao deletar alerta de outro usuário", async () => {
        const { token, propertyId } = await setupFull(validUser)
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/alerts`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAlertBody)
        const alertId = createRes.body.data.id as string
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/alerts/${alertId}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para id inexistente", async () => {
        const { token } = await setupFull()

        const response = await request(app)
            .delete("/api/alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete("/api/alerts/00000000-0000-0000-0000-000000000000")

        expect(response.status).toBe(401)
    })
})