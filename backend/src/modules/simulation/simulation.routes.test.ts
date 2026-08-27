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

// tusdPerKwh=0.3 + tePerKwh=0.3 = 0.6 R$/kWh; tributos 27,25%; bandeira
// GREEN = 0 — mesma fórmula "por dentro" em todos os testes via RATE.
const RATE = 0.6 / (1 - 0.2725)

// ─── Helpers ──────────────────────────────────────────────────────────────────

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (cookie httpOnly).
async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

// Monta a cadeia completa: distribuidora (catálogo) → property → area →
// device (1000W). Distribuidora e bandeira tarifária são inseridas direto
// no banco de teste — não existe mais POST /api/distributors.
async function setupFull(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)
    await createTestTariffFlagConfig(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })

    const areaRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Sala" })

    const deviceRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas/${areaRes.body.data.id}/devices`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ar-condicionado", powerWatts: 1000 })

    return {
        token,
        propertyId: propRes.body.data.id as string,
        areaId: areaRes.body.data.id as string,
        deviceId: deviceRes.body.data.id as string,
    }
}

function simulationUrl(propertyId: string) {
    return `/api/properties/${propertyId}/simulation`
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/simulation — target: PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/simulation — target: PROPERTY", () => {
    it("deve retornar 200 com resultado de simulação DAILY (KWH_DIRECT)", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        expect(response.body.data.period).toBe("DAILY")
        expect(response.body.data.inputMode).toBe("KWH_DIRECT")
        expect(response.body.data.kwhConsumed).toBe(10)
        expect(response.body.data.costBrl).toBeCloseTo(10 * RATE, 6)
        expect(response.body.data.projectedDays).toBe(1)
        expect(response.body.data.powerWatts).toBeNull()
        expect(response.body.data.dailyUsageHours).toBeNull()
    })

    it("deve retornar 200 com resultado de simulação MONTHLY (WATTS_HOURS)", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "MONTHLY",
                target: { type: "PROPERTY" },
                inputMode: "WATTS_HOURS",
                powerWatts: 1000,
                dailyUsageHours: 4,
            })

        expect(response.status).toBe(200)
        // 1000W × 4h × 30 dias = 120 kWh (acima do piso de 100, TRIPHASIC)
        expect(response.body.data.kwhConsumed).toBeCloseTo(120)
        expect(response.body.data.costBrl).toBeCloseTo(120 * RATE, 6)
        expect(response.body.data.projectedDays).toBe(30)
        expect(response.body.data.powerWatts).toBe(1000)
        expect(response.body.data.dailyUsageHours).toBe(4)
    })

    it("deve retornar 200 com resultado de simulação ANNUAL (WATTS_HOURS)", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "ANNUAL",
                target: { type: "PROPERTY" },
                inputMode: "WATTS_HOURS",
                powerWatts: 2000,
                dailyUsageHours: 2,
            })

        expect(response.status).toBe(200)
        // 2000W × 2h × 365 dias = 1460 kWh — média mensal acima do piso de 100
        expect(response.body.data.kwhConsumed).toBeCloseTo(1460)
        expect(response.body.data.costBrl).toBeCloseTo(1460 * RATE, 6)
        expect(response.body.data.projectedDays).toBe(365)
    })

    it("deve retornar 403 para property de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para propertyId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post(simulationUrl("00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(404)
    })

    it("deve retornar 422 para kwhConsumed negativo", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: -5,
            })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para dailyUsageHours acima de 24", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "WATTS_HOURS",
                powerWatts: 1000,
                dailyUsageHours: 25,
            })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para period inválido", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "WEEKLY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post(simulationUrl("00000000-0000-0000-0000-000000000000"))
            .send({
                period: "DAILY",
                target: { type: "PROPERTY" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST — target: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/simulation — target: AREA", () => {
    it("deve retornar 200 para simulação de área com KWH_DIRECT", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "AREA", areaId },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 5,
            })

        expect(response.status).toBe(200)
        expect(response.body.data.target).toMatchObject({ type: "AREA", areaId })
        expect(response.body.data.costBrl).toBeCloseTo(5 * RATE, 6)
    })

    it("deve retornar 200 para simulação de área com WATTS_HOURS", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "MONTHLY",
                target: { type: "AREA", areaId },
                inputMode: "WATTS_HOURS",
                powerWatts: 800,
                dailyUsageHours: 3,
            })

        expect(response.status).toBe(200)
        // 800W × 3h × 30 dias = 72 kWh (área não tem piso)
        expect(response.body.data.kwhConsumed).toBeCloseTo(72)
        expect(response.body.data.costBrl).toBeCloseTo(72 * RATE, 6)
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "AREA", areaId: "00000000-0000-0000-0000-000000000000" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 para área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send({
                period: "DAILY",
                target: { type: "AREA", areaId },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST — target: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/simulation — target: DEVICE", () => {
    it("deve retornar 200 para simulação de device com KWH_DIRECT", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "DEVICE", deviceId, areaId },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 8,
            })

        expect(response.status).toBe(200)
        expect(response.body.data.target).toMatchObject({ type: "DEVICE", deviceId, areaId })
        expect(response.body.data.costBrl).toBeCloseTo(8 * RATE, 6)
    })

    it("deve retornar 200 para simulação de device com WATTS_HOURS (powerWatts explícito)", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "MONTHLY",
                target: { type: "DEVICE", deviceId, areaId },
                inputMode: "WATTS_HOURS",
                powerWatts: 500,
                dailyUsageHours: 6,
            })

        expect(response.status).toBe(200)
        // 500W × 6h × 30 dias = 90 kWh
        expect(response.body.data.kwhConsumed).toBeCloseTo(90)
        expect(response.body.data.costBrl).toBeCloseTo(90 * RATE, 6)
    })

    it("deve usar powerWatts do device cadastrado quando omitido no body", async () => {
        // device.powerWatts = 1000W (definido no setupFull)
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "DEVICE", deviceId, areaId },
                inputMode: "WATTS_HOURS",
                // powerWatts omitido → usa 1000W do cadastro
                dailyUsageHours: 8,
            })

        expect(response.status).toBe(200)
        // 1000W × 8h × 1 dia = 8 kWh
        expect(response.body.data.powerWatts).toBe(1000)
        expect(response.body.data.kwhConsumed).toBeCloseTo(8)
        expect(response.body.data.costBrl).toBeCloseTo(8 * RATE, 6)
    })

    it("deve retornar 422 ao omitir powerWatts para device sem powerWatts cadastrado", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const deviceSemWattsRes = await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Dispositivo sem watts" })

        const deviceSemWattsId = deviceSemWattsRes.body.data.id as string

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: { type: "DEVICE", deviceId: deviceSemWattsId, areaId },
                inputMode: "WATTS_HOURS",
                dailyUsageHours: 8,
            })

        expect(response.status).toBe(422)
    })

    it("deve retornar 404 para deviceId inexistente", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${token}`)
            .send({
                period: "DAILY",
                target: {
                    type: "DEVICE",
                    deviceId: "00000000-0000-0000-0000-000000000000",
                    areaId,
                },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(simulationUrl(propertyId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send({
                period: "DAILY",
                target: { type: "DEVICE", deviceId, areaId },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post(simulationUrl("00000000-0000-0000-0000-000000000000"))
            .send({
                period: "DAILY",
                target: { type: "DEVICE", deviceId: "x", areaId: "y" },
                inputMode: "KWH_DIRECT",
                kwhConsumed: 10,
            })

        expect(response.status).toBe(401)
    })
})
