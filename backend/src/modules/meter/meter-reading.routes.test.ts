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

async function setupPropertyWithMeter(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "MONOPHASIC" })
    const propertyId = propRes.body.data.id as string

    const meterRes = await request(app)
        .post("/api/meters")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/medidor",
        })
    const meterId = meterRes.body.data.id as string

    await prismaHttpTest.meterReading.create({
        data: {
            meterId,
            minuteStart: new Date("2026-01-15T14:10:00Z"),
            kwhConsumed: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 1,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })

    return { token, propertyId }
}

const WINDOW_QS = "from=2026-01-15T14:00:00Z&to=2026-01-15T15:00:00Z"

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/meter-readings", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get(
            `/api/meter-readings?targetType=PROPERTY&targetId=00000000-0000-0000-0000-000000000000&granularity=hour&${WINDOW_QS}`,
        )
        expect(response.status).toBe(401)
    })

    it("retorna 200 com os baldes agregados para o alvo com medidor", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(
                `/api/meter-readings?targetType=PROPERTY&targetId=${propertyId}&granularity=hour&${WINDOW_QS}`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.granularity).toBe("hour")
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].avgPowerW).toBeCloseTo(1100)
    })

    it("retorna 404 quando o alvo não tem medidor vinculado", async () => {
        const token = await registerAndLogin()
        const distributor = await createTestDistributor(prismaHttpTest)

        const propRes = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Sem medidor",
                distributorId: distributor.id,
                electricalSystem: "MONOPHASIC",
            })

        const response = await request(app)
            .get(
                `/api/meter-readings?targetType=PROPERTY&targetId=${propRes.body.data.id}&granularity=hour&${WINDOW_QS}`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("retorna 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupPropertyWithMeter(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(
                `/api/meter-readings?targetType=PROPERTY&targetId=${propertyId}&granularity=hour&${WINDOW_QS}`,
            )
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("retorna 422 para granularity inválida (day não existe aqui — é domínio de /api/consumption)", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(
                `/api/meter-readings?targetType=PROPERTY&targetId=${propertyId}&granularity=day&${WINDOW_QS}`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 quando faltam from/to (obrigatórios aqui, diferente de /api/consumption)", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(`/api/meter-readings?targetType=PROPERTY&targetId=${propertyId}&granularity=hour`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})
