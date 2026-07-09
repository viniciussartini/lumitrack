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
    acceptedTerms: true,
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const anotherUser = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Maria",
    lastName:  "Santos",
    cpf:       "310.037.856-38",
}

// A distribuidora é o pré-requisito para criar uma propriedade.
// Sem ela, o POST /api/properties retorna 422 e todo o setupFull falha.
const validDistributorBody = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage:   220,
    kwhPrice:         0.75,
}

const validMqttBody = {
    protocol: "MQTT",
    host:     "broker.example.com",
    port:     1883,
    topic:    "home/sala/medidor",
}

const validRs485Body = {
    protocol: "RS485",
    address:  "/dev/ttyS0",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (#06, cookie httpOnly).
async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email:    user.email,
        password: user.password,
        channel:  "MOBILE",
    })
    return res.body.data.token as string
}

async function setupFull(user = validUser) {
    const token = await registerAndLogin(user)

    // 1. Cria a distribuidora — obrigatória para vincular à propriedade
    const distRes = await request(app)
        .post("/api/distributors")
        .set("Authorization", `Bearer ${token}`)
        .send(validDistributorBody)

    // 2. Cria a propriedade vinculando a distribuidora
    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distRes.body.data.id })

    // 3. Cria a área dentro da propriedade
    const areaRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Sala" })

    // 4. Cria o device dentro da área
    const deviceRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas/${areaRes.body.data.id}/devices`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Medidor", powerWatts: 1000 })

    return {
        token,
        propertyId: propRes.body.data.id   as string,
        areaId:     areaRes.body.data.id    as string,
        deviceId:   deviceRes.body.data.id  as string,
    }
}

function iotUrl(propertyId: string, areaId: string, deviceId: string) {
    return `/api/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/iot-config`
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanHttpDatabase() })
afterAll(async ()  => { await prismaHttpTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────
// POST .../devices/:deviceId/iot-config
// ─────────────────────────────────────────────────────────────────────────────

describe("POST .../iot-config", () => {
    it("deve criar config MQTT e retornar 201", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        expect(res.status).toBe(201)
        expect(res.body.status).toBe("success")
        expect(res.body.data.deviceId).toBe(deviceId)
        expect(res.body.data.protocol).toBe("MQTT")
        expect(res.body.data.host).toBe("broker.example.com")
        expect(res.body.data.port).toBe(1883)
        expect(res.body.data.topic).toBe("home/sala/medidor")
        expect(res.body.data.address).toBeNull()
    })

    it("deve criar config RS485 e retornar 201", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validRs485Body)

        expect(res.status).toBe(201)
        expect(res.body.data.protocol).toBe("RS485")
        expect(res.body.data.address).toBe("/dev/ttyS0")
        expect(res.body.data.host).toBeNull()
    })

    it("deve criar config com campo extra (baudRate) e retornar 201", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validRs485Body, extra: { baudRate: 9600, parity: "none" } })

        expect(res.status).toBe(201)
        expect(res.body.data.extra).toEqual({ baudRate: 9600, parity: "none" })
    })

    it("deve retornar 409 se o device já tiver uma config IoT", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        expect(res.status).toBe(409)
    })

    it("deve retornar 422 para MQTT sem topic", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send({ protocol: "MQTT", host: "broker.example.com", port: 1883 })

        expect(res.status).toBe(422)
    })

    it("deve retornar 422 para protocolo inválido", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send({ protocol: "ZIGBEE", host: "broker.example.com" })

        expect(res.status).toBe(422)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const res = await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validMqttBody)

        expect(res.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const res = await request(app)
            .post(iotUrl("p", "a", "d"))
            .send(validMqttBody)

        expect(res.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET .../devices/:deviceId/iot-config
// ─────────────────────────────────────────────────────────────────────────────

describe("GET .../iot-config", () => {
    it("deve retornar 200 com a config do device", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .get(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.data.protocol).toBe("MQTT")
    })

    it("deve retornar 404 se não houver config para o device", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .get(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(404)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const res = await request(app)
            .get(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(res.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const res = await request(app).get(iotUrl("p", "a", "d"))
        expect(res.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT .../devices/:deviceId/iot-config
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT .../iot-config", () => {
    it("deve atualizar o topic mantendo o protocolo MQTT e retornar 200", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .put(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validMqttBody, topic: "home/sala/novo-topico" })

        expect(res.status).toBe(200)
        expect(res.body.data.topic).toBe("home/sala/novo-topico")
    })

    it("deve trocar protocolo de MQTT para RS485 e limpar campos antigos", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .put(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validRs485Body)

        expect(res.status).toBe(200)
        expect(res.body.data.protocol).toBe("RS485")
        expect(res.body.data.address).toBe("/dev/ttyS0")
        // Campos do MQTT antigo devem ter sido zerados
        expect(res.body.data.host).toBeNull()
        expect(res.body.data.port).toBeNull()
        expect(res.body.data.topic).toBeNull()
    })

    it("deve retornar 404 ao atualizar config inexistente", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .put(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        expect(res.status).toBe(404)
    })

    it("deve retornar 422 para MODBUS_TCP sem address", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .put(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send({ protocol: "MODBUS_TCP", host: "192.168.1.10", port: 502 })

        expect(res.status).toBe(422)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const res = await request(app)
            .put(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validMqttBody)

        expect(res.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const res = await request(app)
            .put(iotUrl("p", "a", "d"))
            .send(validMqttBody)

        expect(res.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE .../devices/:deviceId/iot-config
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE .../iot-config", () => {
    it("deve remover a config e retornar 204", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()
        await request(app)
            .post(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)
            .send(validMqttBody)

        const res = await request(app)
            .delete(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(204)

        // Confirma que o GET subsequente retorna 404
        const getRes = await request(app)
            .get(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)

        expect(getRes.status).toBe(404)
    })

    it("deve retornar 404 ao deletar config inexistente", async () => {
        const { token, propertyId, areaId, deviceId } = await setupFull()

        const res = await request(app)
            .delete(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(404)
    })

    it("deve retornar 403 para device de outro usuário", async () => {
        const { propertyId, areaId, deviceId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const res = await request(app)
            .delete(iotUrl(propertyId, areaId, deviceId))
            .set("Authorization", `Bearer ${tokenB}`)

        expect(res.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const res = await request(app).delete(iotUrl("p", "a", "d"))
        expect(res.status).toBe(401)
    })
})