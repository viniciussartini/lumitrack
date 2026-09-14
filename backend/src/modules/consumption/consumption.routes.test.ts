import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import {
    createTestDistributor,
    createTestTariffFlagConfig,
} from "@/shared/test/distributorFixture.js"

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
    await createTestTariffFlagConfig(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })
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
            minuteStart: new Date("2026-01-15T13:00:00Z"),
            kwhConsumed: 0.02,
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

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/consumption", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get(
            "/api/consumption?targetType=PROPERTY&targetId=00000000-0000-0000-0000-000000000000&granularity=hour",
        )
        expect(response.status).toBe(401)
    })

    it("retorna 200 com os buckets agregados para o alvo com medidor", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(`/api/consumption?targetType=PROPERTY&targetId=${propertyId}&granularity=hour`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.granularity).toBe("hour")
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].kwhConsumed).toBeCloseTo(0.02)
        expect(response.body.data.total).toBe(1)
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
                `/api/consumption?targetType=PROPERTY&targetId=${propRes.body.data.id}&granularity=hour`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("retorna 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupPropertyWithMeter(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/consumption?targetType=PROPERTY&targetId=${propertyId}&granularity=hour`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("retorna 422 para granularity inválida", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(`/api/consumption?targetType=PROPERTY&targetId=${propertyId}&granularity=week`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 quando faltam parâmetros obrigatórios", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/consumption?granularity=hour")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

describe("GET /api/consumption/summary", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get(
            "/api/consumption/summary?targetType=PROPERTY&ids=00000000-0000-0000-0000-000000000000&granularity=month",
        )
        expect(response.status).toBe(401)
    })

    it("retorna 200 com o bucket mais recente do alvo próprio, e filtra o de outro usuário", async () => {
        const { token, propertyId } = await setupPropertyWithMeter(validUser)
        const { propertyId: otherPropertyId } = await setupPropertyWithMeter(anotherUser)
        // Token de A pedindo os dois ids — só o dele deve voltar.
        const response = await request(app)
            .get(
                `/api/consumption/summary?targetType=PROPERTY&ids=${propertyId},${otherPropertyId}&granularity=month`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].id).toBe(propertyId)
    })

    it("retorna 200 com items vazio quando nenhum id sobrevive à autorização", async () => {
        const { token } = await setupPropertyWithMeter(validUser)
        const { propertyId: otherPropertyId } = await setupPropertyWithMeter(anotherUser)

        const response = await request(app)
            .get(
                `/api/consumption/summary?targetType=PROPERTY&ids=${otherPropertyId}&granularity=month`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
    })

    it("retorna 422 para lote vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/consumption/summary?targetType=PROPERTY&ids=&granularity=month")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 para lote acima do teto de 50", async () => {
        const token = await registerAndLogin()
        const tooMany = Array.from(
            { length: 51 },
            () => "00000000-0000-0000-0000-000000000000",
        ).join(",")

        const response = await request(app)
            .get(`/api/consumption/summary?targetType=PROPERTY&ids=${tooMany}&granularity=month`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 para granularity inválida", async () => {
        const { token, propertyId } = await setupPropertyWithMeter()

        const response = await request(app)
            .get(`/api/consumption/summary?targetType=PROPERTY&ids=${propertyId}&granularity=week`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

// A regra de negócio (fórmula ACR × ACL, veredito, PLD de contexto) já está
// coberta em consumption.service.test.ts — aqui só o contrato HTTP: auth,
// validação de query, ownership e um smoke test do caminho feliz.
describe("GET /api/consumption/acl-comparison", () => {
    async function setupAclComparisonFixture(user = validUser) {
        const token = await registerAndLogin(user)
        const distributor = await createTestDistributor(prismaHttpTest)
        await prismaHttpTest.energyDistributor.update({
            where: { id: distributor.id },
            data: { peakWindowStartHour: 18, peakWindowEndHour: 21 },
        })
        await createTestTariffFlagConfig(prismaHttpTest)
        await prismaHttpTest.tariffEnergyRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: "PEAK",
                tusdPerKwh: 0.75,
                tePerKwh: 0.55,
            },
        })
        await prismaHttpTest.tariffEnergyRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: "OFF_PEAK",
                tusdPerKwh: 0.12,
                tePerKwh: 0.28,
            },
        })
        await prismaHttpTest.tariffDemandRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: null,
                tusdPerKw: 18.0,
            },
        })

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
                contractingEnvironment: "ACL",
            })
        const propertyId = propRes.body.data.id as string

        await request(app).post("/api/acl-contracts").set("Authorization", `Bearer ${token}`).send({
            propertyId,
            retailerName: "Comerc Energia",
            submarket: "SOUTHEAST_CENTER_WEST",
            energySource: "CONVENTIONAL",
            energyPricePerMwh: 300,
            contractedVolumeMwh: 30,
            validFrom: "2026-01-01",
        })

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
                topic: "frigorifico/medidor",
            })
        const meterId = meterRes.body.data.id as string

        await prismaHttpTest.meterReading.create({
            data: {
                meterId,
                minuteStart: new Date("2026-08-04T13:00:00Z"),
                kwhConsumed: 28,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 100_000,
                avgPowerFactor: 1,
                sampleCount: 60,
                secondsCovered: 60,
            },
        })

        return { token, propertyId }
    }

    it("retorna 401 sem token", async () => {
        const response = await request(app).get(
            "/api/consumption/acl-comparison?propertyId=00000000-0000-0000-0000-000000000000&from=2026-08-01&to=2026-08-01",
        )
        expect(response.status).toBe(401)
    })

    it("retorna 200 com a comparação ACR × ACL no caminho feliz", async () => {
        const { token, propertyId } = await setupAclComparisonFixture()

        const response = await request(app)
            .get(
                `/api/consumption/acl-comparison?propertyId=${propertyId}&from=2026-08-01&to=2026-08-01`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.months).toHaveLength(1)
        expect(response.body.data.verdict).toMatch(/^(ACL_CHEAPER|ACR_CHEAPER|EQUIVALENT)$/)
    })

    it("retorna 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupAclComparisonFixture(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(
                `/api/consumption/acl-comparison?propertyId=${propertyId}&from=2026-08-01&to=2026-08-01`,
            )
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("retorna 422 quando faltam parâmetros obrigatórios", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/consumption/acl-comparison?from=2026-08-01&to=2026-08-01")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 quando to é anterior a from", async () => {
        const { token, propertyId } = await setupAclComparisonFixture()

        const response = await request(app)
            .get(
                `/api/consumption/acl-comparison?propertyId=${propertyId}&from=2026-08-01&to=2026-07-01`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 422 quando a janela passa de 24 meses", async () => {
        const { token, propertyId } = await setupAclComparisonFixture()

        // 2024-08 a 2026-09: 26 meses — acima do teto MAX_COMPARISON_MONTHS.
        const response = await request(app)
            .get(
                `/api/consumption/acl-comparison?propertyId=${propertyId}&from=2024-08-01&to=2026-09-01`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("retorna 200 para uma janela de exatamente 24 meses (teto, não acima dele)", async () => {
        const { token, propertyId } = await setupAclComparisonFixture()

        // 2024-09 a 2026-08: exatamente 24 meses.
        const response = await request(app)
            .get(
                `/api/consumption/acl-comparison?propertyId=${propertyId}&from=2024-09-01&to=2026-08-01`,
            )
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
    })
})
