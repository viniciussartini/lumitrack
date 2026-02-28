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

const validConsumptionBody = {
    period: "DAILY",
    referenceDate: "2025-01-15",
    kwhConsumed: 10,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "WEB",
    })
    return loginRes.body.data.token as string
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
// TARGET: PROPERTY — /api/properties/:propertyId/consumption
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/consumption", () => {
    it("deve criar registro de consumo e retornar 201 com costBrl calculado", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(201)
        expect(response.body.data.propertyId).toBe(propertyId)
        expect(response.body.data.kwhConsumed).toBe(10)
        // 10 kWh × R$0,75 = R$7,50
        expect(response.body.data.costBrl).toBeCloseTo(7.5)
    })

    it("deve retornar 409 para duplicidade period + property + referenceDate", async () => {
        const { token, propertyId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(409)
    })

    it("deve retornar 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para kwhConsumed zero", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validConsumptionBody, kwhConsumed: 0 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para period inválido", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validConsumptionBody, period: "WEEKLY" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/00000000-0000-0000-0000-000000000000/consumption")
            .send(validConsumptionBody)

        expect(response.status).toBe(401)
    })
})

describe("GET /api/properties/:propertyId/consumption", () => {
    it("deve retornar 200 com lista vazia", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve filtrar por period via query param", async () => {
        const { token, propertyId } = await setupFull()

        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 5 })

        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 150 })

        const response = await request(app)
            .get(`/api/properties/${propertyId}/consumption?period=MONTHLY`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
        expect(response.body.data[0].period).toBe("MONTHLY")
    })

    it("deve retornar 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/consumption")

        expect(response.status).toBe(401)
    })
})

describe("GET /api/properties/:propertyId/consumption/:id", () => {
    it("deve retornar 200 com os dados do registro", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)
        const recordId = createRes.body.data.id as string

        const response = await request(app)
            .get(`/api/properties/${propertyId}/consumption/${recordId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(recordId)
    })

    it("deve retornar 404 para id inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(`/api/properties/${propertyId}/consumption/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/consumption/00000000-0000-0000-0000-000000000001")

        expect(response.status).toBe(401)
    })
})

describe("PUT /api/properties/:propertyId/consumption/:id", () => {
    it("deve atualizar kwhConsumed e recalcular costBrl", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)
        const recordId = createRes.body.data.id as string

        const response = await request(app)
            .put(`/api/properties/${propertyId}/consumption/${recordId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ kwhConsumed: 20 })

        expect(response.status).toBe(200)
        expect(response.body.data.kwhConsumed).toBe(20)
        // 20 × 0,75 = 15
        expect(response.body.data.costBrl).toBeCloseTo(15)
    })

    it("deve retornar 422 para kwhConsumed negativo", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)
        const recordId = createRes.body.data.id as string

        const response = await request(app)
            .put(`/api/properties/${propertyId}/consumption/${recordId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ kwhConsumed: -5 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000/consumption/00000000-0000-0000-0000-000000000001")
            .send({ kwhConsumed: 5 })

        expect(response.status).toBe(401)
    })
})

describe("DELETE /api/properties/:propertyId/consumption/:id", () => {
    it("deve deletar o registro e retornar 204", async () => {
        const { token, propertyId } = await setupFull()
        const createRes = await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)
        const recordId = createRes.body.data.id as string

        const response = await request(app)
            .delete(`/api/properties/${propertyId}/consumption/${recordId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
    })

    it("deve retornar 404 para id inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .delete(`/api/properties/${propertyId}/consumption/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete("/api/properties/00000000-0000-0000-0000-000000000000/consumption/00000000-0000-0000-0000-000000000001")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// TARGET: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas/:areaId/consumption", () => {
    it("deve criar registro de consumo para área com costBrl calculado", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(201)
        expect(response.body.data.areaId).toBe(areaId)
        expect(response.body.data.costBrl).toBeCloseTo(7.5)
    })

    it("deve retornar 409 para duplicidade", async () => {
        const { token, propertyId, areaId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(409)
    })

    it("deve retornar 403 para área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/00000000-0000-0000-0000-000000000000/areas/00000000-0000-0000-0000-000000000001/consumption")
            .send(validConsumptionBody)

        expect(response.status).toBe(401)
    })
})

describe("GET /api/properties/:propertyId/areas/:areaId/consumption", () => {
    it("deve retornar 200 com lista e suporte a filtro por period", async () => {
        const { token, propertyId, areaId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 5 })

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas/${areaId}/consumption?period=DAILY`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/areas/00000000-0000-0000-0000-000000000001/consumption")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// TARGET: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption", () => {
    it("deve criar registro de consumo para device com costBrl calculado", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(201)
        expect(response.body.data.deviceId).toBe(deviceId)
        expect(response.body.data.costBrl).toBeCloseTo(7.5)
    })

    it("deve retornar 409 para duplicidade", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(409)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validConsumptionBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/p/areas/a/devices/d/consumption")
            .send(validConsumptionBody)

        expect(response.status).toBe(401)
    })
})

describe("GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption", () => {
    it("deve retornar 200 com lista de registros do device", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send(validConsumptionBody)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
        expect(response.body.data[0].deviceId).toBe(deviceId)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/p/areas/a/devices/d/consumption")

        expect(response.status).toBe(401)
    })
})