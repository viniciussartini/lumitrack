import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

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

const validDemandAlertBody = { name: "Ultrapassagem de demanda" }

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

// Cria user → distribuidora (catálogo) → property Grupo A → medidor (via API real).
async function setupUserWithGroupAMeter(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Frigorífico",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
        })

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

async function createDemandAlert(
    token: string,
    meterId: string,
    body: Record<string, unknown> = validDemandAlertBody,
) {
    const res = await request(app)
        .post("/api/demand-alerts")
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
// POST /api/demand-alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/demand-alerts", () => {
    it("deve criar um alerta e retornar 201, com limiar default de 105%", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDemandAlertBody, meterId })

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.meterId).toBe(meterId)
        expect(response.body.data.thresholdPercent).toBe(105)
        expect(response.body.data.enabled).toBe(true)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).post("/api/demand-alerts").send(validDemandAlertBody)
        expect(response.status).toBe(401)
    })

    it("deve retornar 403 ao tentar criar alerta com conta demo", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const demoUser = await prismaHttpTest.user.findUniqueOrThrow({
            where: { email: DEMO_RESIDENTIAL_EMAIL },
        })
        const dist = await createTestDistributor(prismaHttpTest)
        const property = await prismaHttpTest.property.create({
            data: {
                userId: demoUser.id,
                distributorId: dist.id,
                name: "Frigorífico da Demo",
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                contractedDemandKw: 200,
            },
        })
        const meter = await prismaHttpTest.meter.create({
            data: {
                name: "Medidor da Demo",
                targetType: "PROPERTY",
                propertyId: property.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "t",
            },
        })

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${demoToken}`)
            .send({ ...validDemandAlertBody, meterId: meter.id })

        expect(response.status).toBe(403)
        expect(response.body.message).toBe("Conta de demonstração é somente leitura")
    })

    it("deve retornar 404 para meterId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDemandAlertBody, meterId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao vincular medidor de outro usuário", async () => {
        const { meterId } = await setupUserWithGroupAMeter(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ ...validDemandAlertBody, meterId })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para medidor de propriedade Grupo B", async () => {
        const token = await registerAndLogin()
        const distributor = await createTestDistributor(prismaHttpTest)
        const propRes = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "MONOPHASIC" })
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

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDemandAlertBody, meterId: meterRes.body.data.id })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para nome vazio", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDemandAlertBody, meterId, name: "" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para thresholdPercent zero ou negativo", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()

        const response = await request(app)
            .post("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDemandAlertBody, meterId, thresholdPercent: 0 })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demand-alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/demand-alerts", () => {
    it("deve retornar 200 com envelope paginado vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/demand-alerts")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar apenas os alertas do usuário autenticado", async () => {
        const { token: tokenA, meterId: meterIdA } = await setupUserWithGroupAMeter(validUser)
        const { token: tokenB, meterId: meterIdB } = await setupUserWithGroupAMeter(anotherUser)
        await createDemandAlert(tokenA, meterIdA)
        await createDemandAlert(tokenB, meterIdB, { ...validDemandAlertBody, name: "Alerta B" })

        const response = await request(app)
            .get("/api/demand-alerts")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].name).toBe("Ultrapassagem de demanda")
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/demand-alerts")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demand-alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/demand-alerts/:id", () => {
    it("deve retornar 200 com os dados do alerta", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .get(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(alert.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/demand-alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithGroupAMeter(validUser)
        const alert = await createDemandAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/demand-alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/demand-alerts/:id", () => {
    it("deve atualizar o alerta e retornar 200", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .put(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Renomeado", thresholdPercent: 95 })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Renomeado")
        expect(response.body.data.thresholdPercent).toBe(95)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .put("/api/demand-alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao atualizar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithGroupAMeter(validUser)
        const alert = await createDemandAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para dados inválidos", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .put(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ thresholdPercent: -1 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para corpo vazio", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .put(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({})

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/demand-alerts/:id/enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/demand-alerts/:id/enabled", () => {
    it("deve alternar enabled e retornar 200", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .patch(`/api/demand-alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${token}`)
            .send({ enabled: false })

        expect(response.status).toBe(200)
        expect(response.body.data.enabled).toBe(false)
    })

    it("deve retornar 422 quando enabled não é booleano", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .patch(`/api/demand-alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${token}`)
            .send({ enabled: "não" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 403 para alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithGroupAMeter(validUser)
        const alert = await createDemandAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .patch(`/api/demand-alerts/${alert.id}/enabled`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ enabled: false })

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/demand-alerts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/demand-alerts/:id", () => {
    it("deve deletar o alerta e retornar 204", async () => {
        const { token, meterId } = await setupUserWithGroupAMeter()
        const alert = await createDemandAlert(token, meterId)

        const response = await request(app)
            .delete(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao deletar alerta de outro usuário", async () => {
        const { token: tokenA, meterId } = await setupUserWithGroupAMeter(validUser)
        const alert = await createDemandAlert(tokenA, meterId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/demand-alerts/${alert.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .delete("/api/demand-alerts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/demand-alerts/00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })
})
