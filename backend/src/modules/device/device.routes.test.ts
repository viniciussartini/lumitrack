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

const validDeviceBody = {
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
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

    return {
        token,
        propertyId: propRes.body.data.id as string,
        areaId: areaRes.body.data.id as string,
    }
}

function deviceUrl(propertyId: string, areaId: string, deviceId?: string) {
    const base = `/api/properties/${propertyId}/areas/${areaId}/devices`
    return deviceId ? `${base}/${deviceId}` : base
}

async function createDevice(
    token: string,
    propertyId: string,
    areaId: string,
    body: Record<string, unknown> = validDeviceBody,
) {
    const res = await request(app)
        .post(deviceUrl(propertyId, areaId))
        .set("Authorization", `Bearer ${token}`)
        .send(body)
    return res.body.data as { id: string }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/areas/:areaId/devices
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas/:areaId/devices", () => {
    it("deve criar um dispositivo com todos os campos e retornar 201", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)
            .send(validDeviceBody)

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.areaId).toBe(areaId)
        expect(response.body.data.name).toBe("Ar-condicionado")
        expect(response.body.data.brand).toBe("Daikin")
        expect(response.body.data.powerWatts).toBe(1200)
    })

    it("deve criar um dispositivo apenas com o nome e retornar 201", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Ventilador" })

        expect(response.status).toBe(201)
        expect(response.body.data.brand).toBeNull()
        expect(response.body.data.powerWatts).toBeNull()
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(deviceUrl(propertyId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${token}`)
            .send(validDeviceBody)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao criar dispositivo em área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validDeviceBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para nome vazio", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para powerWatts zero ou negativo", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const zeroRes = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Dispositivo", powerWatts: 0 })

        expect(zeroRes.status).toBe(422)

        const negativeRes = await request(app)
            .post(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Dispositivo", powerWatts: -100 })

        expect(negativeRes.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post(deviceUrl("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001"))
            .send(validDeviceBody)

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:propertyId/areas/:areaId/devices
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/areas/:areaId/devices", () => {
    it("deve retornar 200 com lista vazia quando não há dispositivos", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar dispositivos ordenados por nome", async () => {
        const { token, propertyId, areaId } = await setupFull()
        await createDevice(token, propertyId, areaId, { name: "Ventilador" })
        await createDevice(token, propertyId, areaId, { name: "Ar-condicionado" })
        await createDevice(token, propertyId, areaId, { name: "Lâmpada" })

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(3)
        expect(response.body.data[0].name).toBe("Ar-condicionado")
        expect(response.body.data[1].name).toBe("Lâmpada")
        expect(response.body.data[2].name).toBe("Ventilador")
    })

    it("deve retornar 403 ao listar dispositivos de área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get(deviceUrl("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001"))

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId", () => {
    it("deve retornar 200 com os dados do dispositivo", async () => {
        const { token, propertyId, areaId } = await setupFull()
        const device = await createDevice(token, propertyId, areaId)

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId, device.id))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(device.id)
    })

    it("deve retornar 404 para deviceId inexistente", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar dispositivo de área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get(deviceUrl(
                "00000000-0000-0000-0000-000000000000",
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
            ))

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/properties/:propertyId/areas/:areaId/devices/:deviceId
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/properties/:propertyId/areas/:areaId/devices/:deviceId", () => {
    it("deve atualizar o dispositivo e retornar 200", async () => {
        const { token, propertyId, areaId } = await setupFull()
        const device = await createDevice(token, propertyId, areaId)

        const response = await request(app)
            .put(deviceUrl(propertyId, areaId, device.id))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Ar-condicionado Inverter", powerWatts: 900 })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Ar-condicionado Inverter")
        expect(response.body.data.powerWatts).toBe(900)
    })

    it("deve retornar 404 para deviceId inexistente", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .put(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao tentar atualizar dispositivo de área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "X" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para powerWatts negativo na atualização", async () => {
        const { token, propertyId, areaId } = await setupFull()
        const device = await createDevice(token, propertyId, areaId)

        const response = await request(app)
            .put(deviceUrl(propertyId, areaId, device.id))
            .set("Authorization", `Bearer ${token}`)
            .send({ powerWatts: -50 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put(deviceUrl(
                "00000000-0000-0000-0000-000000000000",
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
            ))
            .send({ name: "X" })

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/properties/:propertyId/areas/:areaId/devices/:deviceId
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/properties/:propertyId/areas/:areaId/devices/:deviceId", () => {
    it("deve deletar o dispositivo e retornar 204", async () => {
        const { token, propertyId, areaId } = await setupFull()
        const device = await createDevice(token, propertyId, areaId)

        const response = await request(app)
            .delete(deviceUrl(propertyId, areaId, device.id))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(deviceUrl(propertyId, areaId, device.id))
            .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao tentar deletar dispositivo de área de outro usuário", async () => {
        const { propertyId, areaId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para deviceId inexistente", async () => {
        const { token, propertyId, areaId } = await setupFull()

        const response = await request(app)
            .delete(deviceUrl(propertyId, areaId, "00000000-0000-0000-0000-000000000000"))
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete(deviceUrl(
                "00000000-0000-0000-0000-000000000000",
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
            ))

        expect(response.status).toBe(401)
    })
})