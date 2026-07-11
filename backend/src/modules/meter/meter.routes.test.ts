import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────
//
// Property/EnergyDistributor são criados direto via Prisma — os módulos HTTP
// de property/distributor ainda não foram atualizados para o schema v2
// (Fase 3), então POST /api/properties falharia por falta de
// `electricalSystem` (campo obrigatório sem default). Isso é o estado
// esperado nesta fase; o módulo `meter` sob teste aqui não depende deles.

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

async function registerAndLogin(user = validUser): Promise<string> {
    await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email: user.email, password: user.password, channel: "MOBILE",
    })
    return res.body.data.token as string
}

let distributorSeq = 0

async function seedProperty(token: string): Promise<string> {
    const email = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { email: string }
    const user = await prismaHttpTest.user.findUniqueOrThrow({ where: { email: email.email } })

    distributorSeq += 1
    const distributor = await prismaHttpTest.energyDistributor.create({
        data: {
            name: "CEMIG",
            cnpj: `06.981.180/000${distributorSeq}-16`,
            state: "MG",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.18,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        },
    })

    const property = await prismaHttpTest.property.create({
        data: {
            userId: user.id,
            distributorId: distributor.id,
            name: "Casa",
            electricalSystem: "MONOPHASIC",
        },
    })

    return property.id
}

const validMeterBody = {
    name: "Medidor MQTT",
    targetType: "PROPERTY",
    protocol: "MQTT",
    host: "localhost",
    port: 1883,
    topic: "lumitrack/meter-1",
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/meters
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/meters", () => {
    it("cria um medidor vinculado a uma propriedade e retorna 201", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)

        const response = await request(app)
            .post("/api/meters")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validMeterBody, propertyId })

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.targetType).toBe("PROPERTY")
        expect(response.body.data.propertyId).toBe(propertyId)
    })

    it("retorna 422 para protocolo MQTT sem topic", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)

        const response = await request(app)
            .post("/api/meters")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "M", targetType: "PROPERTY", propertyId, protocol: "MQTT", host: "localhost", port: 1883 })

        expect(response.status).toBe(422)
    })

    it("retorna 404 para propertyId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/meters")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validMeterBody, propertyId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("retorna 403 ao vincular medidor a propriedade de outro usuário", async () => {
        const tokenA = await registerAndLogin(validUser)
        const propertyId = await seedProperty(tokenA)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/meters")
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ ...validMeterBody, propertyId })

        expect(response.status).toBe(403)
    })

    it("retorna 409 ao vincular um segundo medidor ao mesmo alvo", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)

        await request(app).post("/api/meters").set("Authorization", `Bearer ${token}`).send({ ...validMeterBody, propertyId })

        const response = await request(app)
            .post("/api/meters")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validMeterBody, name: "Outro", propertyId })

        expect(response.status).toBe(409)
    })

    it("retorna 401 sem token", async () => {
        const response = await request(app).post("/api/meters").send(validMeterBody)
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/meters
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/meters", () => {
    it("retorna a lista de medidores do usuário", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)
        await request(app).post("/api/meters").set("Authorization", `Bearer ${token}`).send({ ...validMeterBody, propertyId })

        const response = await request(app).get("/api/meters").set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.total).toBe(1)
    })

    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/meters")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/meters/by-target
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/meters/by-target", () => {
    it("retorna o medidor vinculado ao alvo informado", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)
        const created = await request(app).post("/api/meters").set("Authorization", `Bearer ${token}`).send({ ...validMeterBody, propertyId })

        const response = await request(app)
            .get("/api/meters/by-target")
            .query({ targetType: "PROPERTY", targetId: propertyId })
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(created.body.data.id)
    })

    it("retorna 404 quando o alvo não tem medidor", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)

        const response = await request(app)
            .get("/api/meters/by-target")
            .query({ targetType: "PROPERTY", targetId: propertyId })
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/meters/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/meters/:id", () => {
    it("atualiza o medidor e retorna 200", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)
        const created = await request(app).post("/api/meters").set("Authorization", `Bearer ${token}`).send({ ...validMeterBody, propertyId })

        const response = await request(app)
            .put(`/api/meters/${created.body.data.id as string}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Renomeado", protocol: "MQTT", host: "novo-host", port: 1884, topic: "novo/topic" })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Renomeado")
    })

    it("retorna 403 ao atualizar medidor de outro usuário", async () => {
        const tokenA = await registerAndLogin(validUser)
        const propertyId = await seedProperty(tokenA)
        const created = await request(app).post("/api/meters").set("Authorization", `Bearer ${tokenA}`).send({ ...validMeterBody, propertyId })
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/meters/${created.body.data.id as string}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "X", protocol: "MQTT", host: "h", port: 1883, topic: "t" })

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/meters/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/meters/:id", () => {
    it("remove o medidor e retorna 204", async () => {
        const token = await registerAndLogin()
        const propertyId = await seedProperty(token)
        const created = await request(app).post("/api/meters").set("Authorization", `Bearer ${token}`).send({ ...validMeterBody, propertyId })

        const response = await request(app)
            .delete(`/api/meters/${created.body.data.id as string}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/meters/${created.body.data.id as string}`)
            .set("Authorization", `Bearer ${token}`)
        expect(getResponse.status).toBe(404)
    })

    it("retorna 404 para id inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .delete("/api/meters/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })
})
