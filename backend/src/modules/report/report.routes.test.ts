import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email:     "joao@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const anotherUser = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    firstName: "Maria",
    lastName:  "Santos",
    cpf:       "310.037.856-38",
}

const validDistributorBody = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage:   220,
    kwhPrice:         0.75,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email:    user.email,
        password: user.password,
        channel:  "WEB",
    })
    return loginRes.body.data.token as string
}

// setupFull cria a cadeia completa: user → distributor → property → area → device.
// Retorna tudo que os testes precisam para montar as queries de relatório.
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
        areaId:     areaRes.body.data.id as string,
        deviceId:   deviceRes.body.data.id as string,
    }
}

// Atalho para construir a URL do relatório a partir de query params — evita
// repetição de template string em cada teste.
function reportUrl(propertyId: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    return `/api/properties/${propertyId}/report?${qs}`
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanHttpDatabase() })
afterAll(async ()  => { await prismaHttpTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────
// TARGET: PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/report — target PROPERTY", () => {

    it("deve retornar 200 com relatório correto para property sem registros", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY", period: "MONTHLY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        expect(response.body.data.period).toBe("MONTHLY")
        expect(response.body.data.target.type).toBe("PROPERTY")
        expect(response.body.data.summary.recordCount).toBe(0)
        expect(response.body.data.summary.trend).toBe("INSUFFICIENT_DATA")
        expect(response.body.data.records).toHaveLength(0)
        expect(response.body.data.dateRange).toBeNull()
    })

    it("deve retornar 200 com registros e summary calculado", async () => {
        const { token, propertyId } = await setupFull()

        // Cria 2 registros via consumption endpoint
        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 100 })

        await request(app)
            .post(`/api/properties/${propertyId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "MONTHLY", referenceDate: "2025-02-01", kwhConsumed: 200 })

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY", period: "MONTHLY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        // totalKwh = 100 + 200 = 300; avgKwh = 150
        expect(response.body.data.summary.totalKwh).toBeCloseTo(300)
        expect(response.body.data.summary.avgKwhPerRecord).toBeCloseTo(150)
        // totalCostBrl = 300 × 0,75 = R$ 225,00
        expect(response.body.data.summary.totalCostBrl).toBeCloseTo(225)
        // Segunda metade (200) > primeira (100) em mais de 5% → INCREASING
        expect(response.body.data.summary.trend).toBe("INCREASING")
        expect(response.body.data.records).toHaveLength(2)
    })

    it("deve retornar 200 filtrando por dateFrom e dateTo", async () => {
        const { token, propertyId } = await setupFull()

        for (const [date, kwh] of [
            ["2025-01-01", 100],
            ["2025-06-01", 200],
            ["2025-12-01", 300],
        ] as const) {
            await request(app)
                .post(`/api/properties/${propertyId}/consumption`)
                .set("Authorization", `Bearer ${token}`)
                .send({ period: "MONTHLY", referenceDate: date, kwhConsumed: kwh })
        }

        // Filtra apenas Jun e Dez — Jan fica de fora
        const response = await request(app)
            .get(reportUrl(propertyId, {
                target:   "PROPERTY",
                period:   "MONTHLY",
                dateFrom: "2025-06-01",
                dateTo:   "2025-12-31",
            }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.summary.recordCount).toBe(2)
        expect(response.body.data.dateRange).not.toBeNull()
    })

    it("deve retornar 422 quando period não é informado", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para period inválido", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY", period: "WEEKLY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para dateFrom inválido", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY", period: "MONTHLY", dateFrom: "nao-e-data" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 403 para property de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "PROPERTY", period: "MONTHLY" }))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get(reportUrl("00000000-0000-0000-0000-000000000000", { target: "PROPERTY", period: "MONTHLY" }))

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// TARGET: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/report — target AREA", () => {

    it("deve retornar 200 com relatório correto para área", async () => {
        const { token, propertyId, areaId } = await setupFull()

        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "DAILY", referenceDate: "2025-01-15", kwhConsumed: 8 })

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "AREA", targetId: areaId, period: "DAILY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.target.type).toBe("AREA")
        expect(response.body.data.target.areaId).toBe(areaId)
        expect(response.body.data.summary.recordCount).toBe(1)
        expect(response.body.data.summary.totalKwh).toBeCloseTo(8)
    })

    it("deve retornar 422 quando target=AREA sem targetId", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, { target: "AREA", period: "DAILY" }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, {
                target:   "AREA",
                targetId: "00000000-0000-0000-0000-000000000000",
                period:   "DAILY",
            }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get(reportUrl("00000000-0000-0000-0000-000000000000", {
                target:   "AREA",
                targetId: "00000000-0000-0000-0000-000000000001",
                period:   "DAILY",
            }))

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// TARGET: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/report — target DEVICE", () => {

    it("deve retornar 200 com relatório correto para device", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        await request(app)
            .post(`/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`)
            .set("Authorization", `Bearer ${token}`)
            .send({ period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 5 })

        const response = await request(app)
            .get(reportUrl(propertyId, {
                target:       "DEVICE",
                targetId:     deviceId,
                targetAreaId: areaId,
                period:       "DAILY",
            }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.target.type).toBe("DEVICE")
        expect(response.body.data.target.deviceId).toBe(deviceId)
        expect(response.body.data.summary.totalKwh).toBeCloseTo(5)
    })

    it("deve retornar 422 quando target=DEVICE sem targetAreaId", async () => {
        const { token, propertyId, deviceId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, {
                target:   "DEVICE",
                targetId: deviceId,
                // targetAreaId ausente
                period:   "DAILY",
            }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 404 para deviceId inexistente", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .get(reportUrl(propertyId, {
                target:       "DEVICE",
                targetId:     "00000000-0000-0000-0000-000000000000",
                targetAreaId: areaId,
                period:       "DAILY",
            }))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get(reportUrl("00000000-0000-0000-0000-000000000000", {
                target:       "DEVICE",
                targetId:     "00000000-0000-0000-0000-000000000001",
                targetAreaId: "00000000-0000-0000-0000-000000000002",
                period:       "DAILY",
            }))

        expect(response.status).toBe(401)
    })
})