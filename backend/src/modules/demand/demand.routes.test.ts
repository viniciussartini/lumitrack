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

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

async function createProperty(token: string, extra: Record<string, unknown> = {}) {
    const distributor = await createTestDistributor(prismaHttpTest)
    await prismaHttpTest.energyDistributor.update({
        where: { id: distributor.id },
        data: { peakWindowStartHour: 18, peakWindowEndHour: 21 },
    })
    const response = await request(app)
        .post("/api/properties")
        .set(authed(token))
        .send({
            name: "Metalúrgica",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            ...extra,
        })
    return response.body.data.id as string
}

const groupA = {
    tariffGroup: "GROUP_A",
    tariffSubgroup: "A4",
    tariffModality: "GREEN",
    contractedDemandKw: 200,
}

const attachMeter = (propertyId: string) =>
    prismaHttpTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: `medidor/${propertyId}`,
        },
    })

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/demand/overview", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/demand/overview")

        expect(response.status).toBe(401)
    })

    it("retorna 422 sem propertyId ou com propertyId inválido", async () => {
        const token = await registerAndLogin()

        const missing = await request(app).get("/api/demand/overview").set(authed(token))
        const invalid = await request(app)
            .get("/api/demand/overview?propertyId=abc")
            .set(authed(token))

        expect(missing.status).toBe(422)
        expect(invalid.status).toBe(422)
    })

    it("devolve a visão do dono, com 96 janelas, contratada e ausência onde não há medição", async () => {
        const token = await registerAndLogin()
        const propertyId = await createProperty(token, groupA)
        await attachMeter(propertyId)

        const response = await request(app)
            .get(`/api/demand/overview?propertyId=${propertyId}`)
            .set(authed(token))

        expect(response.status).toBe(200)
        expect(response.body.data).toMatchObject({
            propertyId,
            modality: "GREEN",
            windowMinutes: 15,
            contracted: [{ post: null, kw: 200 }],
            monthMax: { kw: null, windowEnd: null },
            exceedancePercent: null,
            current: { kw: null },
        })
        expect(response.body.data.day.points).toHaveLength(96)
        expect(response.body.data.day.points[0]).toMatchObject({ kw: null, contractedKw: 200 })
    })

    it("retorna 422 para propriedade do Grupo B", async () => {
        const token = await registerAndLogin()
        const propertyId = await createProperty(token)
        await attachMeter(propertyId)

        const response = await request(app)
            .get(`/api/demand/overview?propertyId=${propertyId}`)
            .set(authed(token))

        expect(response.status).toBe(422)
        expect(response.body.message).toMatch(/Grupo A/)
    })

    it("retorna 403 para a propriedade de outro usuário", async () => {
        const ownerToken = await registerAndLogin()
        const propertyId = await createProperty(ownerToken, groupA)
        await attachMeter(propertyId)
        const otherToken = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/demand/overview?propertyId=${propertyId}`)
            .set(authed(otherToken))

        expect(response.status).toBe(403)
        expect(JSON.stringify(response.body)).not.toContain("Metalúrgica")
    })

    it("retorna 404 para propriedade sem medidor", async () => {
        const token = await registerAndLogin()
        const propertyId = await createProperty(token, groupA)

        const response = await request(app)
            .get(`/api/demand/overview?propertyId=${propertyId}`)
            .set(authed(token))

        expect(response.status).toBe(404)
    })
})
