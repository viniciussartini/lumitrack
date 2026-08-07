import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const app = createApp({ prismaClient: prismaHttpTest })

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

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

async function setupAlertWithEvent(token: string) {
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

    const alertRes = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Pico de potência",
            meterId: meterRes.body.data.id,
            referencePowerKw: 10,
            tolerancePercent: 2,
        })

    const alertId = alertRes.body.data.id as string

    await prismaHttpTest.alertTriggerEvent.create({
        data: {
            alertId,
            startedAt: new Date(Date.now() - 60_000),
            endedAt: new Date(),
            durationSeconds: 60,
            minPowerW: 9000,
            maxPowerW: 11000,
            avgPowerW: 10000,
            sampleCount: 10,
        },
    })

    return alertId
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/alert-events", () => {
    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get(
            "/api/alert-events?alertId=00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })

    it("deve retornar 200 com o histórico paginado do alerta", async () => {
        const token = await registerAndLogin()
        const alertId = await setupAlertWithEvent(token)

        const response = await request(app)
            .get(`/api/alert-events?alertId=${alertId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.total).toBe(1)
        expect(response.body.data.items[0].alertId).toBe(alertId)
    })

    it("deve retornar 422 quando alertId está ausente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/alert-events")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 404 para alertId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/alert-events?alertId=00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 para alerta de outro usuário", async () => {
        const tokenA = await registerAndLogin(validUser)
        const alertId = await setupAlertWithEvent(tokenA)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/alert-events?alertId=${alertId}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })
})
