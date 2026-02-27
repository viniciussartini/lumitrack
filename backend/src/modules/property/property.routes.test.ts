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
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
}

const validPropertyBody = {
    name: "Casa Principal",
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30130-010",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    const createRes = await request(app).post("/api/users").send(user)
    const userId = createRes.body.data.id as string
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "WEB",
    })
    const token = loginRes.body.data.token as string
    return { userId, token }
}

async function createDistributor(token: string, body = validDistributorBody) {
    const res = await request(app)
        .post("/api/distributors")
        .set("Authorization", `Bearer ${token}`)
        .send(body)
    return res.body.data as { id: string }
}

async function createProperty(token: string, distributorId: string, body = validPropertyBody) {
    const res = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...body, distributorId })
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
// POST /api/properties
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties", () => {
    it("deve criar uma propriedade com todos os campos e retornar 201", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id })

        expect(response.status).toBe(201)
        expect(response.body.status).toBe("success")
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.name).toBe("Casa Principal")
        expect(response.body.data.state).toBe("MG")
        expect(response.body.data.zipCode).toBe("30130-010")
        expect(response.body.data.distributorId).toBe(dist.id)
    })

    it("deve criar uma propriedade sem campos de endereço e retornar 201", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Galpão", distributorId: dist.id })

        expect(response.status).toBe(201)
        expect(response.body.data.address).toBeNull()
        expect(response.body.data.city).toBeNull()
        expect(response.body.data.state).toBeNull()
        expect(response.body.data.zipCode).toBeNull()
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties")
            .send({ name: "X", distributorId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(401)
    })

    it("deve retornar 404 ao vincular distribuidora inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao vincular distribuidora de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ ...validPropertyBody, distributorId: distA.id })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para UF inválida", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, state: "XX" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para CEP com formato inválido", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, zipCode: "30130010" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para CEP com sequência repetida (00000-000)", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, zipCode: "00000-000" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 quando distributorId não for UUID", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: "nao-e-uuid" })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties", () => {
    it("deve retornar 200 com lista vazia", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/properties")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar apenas as propriedades do usuário autenticado", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)
        const distB = await createDistributor(tokenB)

        await createProperty(tokenA, distA.id)
        await createProperty(tokenB, distB.id, { ...validPropertyBody, name: "Casa de B" })

        const responseA = await request(app)
            .get("/api/properties")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(responseA.status).toBe(200)
        expect(responseA.body.data).toHaveLength(1)
        expect(responseA.body.data[0].name).toBe("Casa Principal")
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/properties")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:id", () => {
    it("deve retornar 200 com os dados da propriedade do usuário autenticado", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(property.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)
        const property = await createProperty(tokenA, distA.id)

        const response = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/properties/:id", () => {
    it("deve atualizar campos de endereço e retornar 200", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Casa Renovada", city: "Contagem" })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Casa Renovada")
        expect(response.body.data.city).toBe("Contagem")
        expect(response.body.data.state).toBe("MG") // não mudou
    })

    it("deve permitir trocar a distribuidora e retornar 200", async () => {
        const { token } = await registerAndLogin()
        const dist1 = await createDistributor(token)
        const dist2 = await createDistributor(token, {
            ...validDistributorBody,
            name: "CPFL Energia",
            cnpj: "02.429.144/0001-93",
        })
        const property = await createProperty(token, dist1.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ distributorId: dist2.id })

        expect(response.status).toBe(200)
        expect(response.body.data.distributorId).toBe(dist2.id)
    })

    it("deve retornar 403 ao tentar vincular distribuidora de outro usuário na atualização", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)
        const distB = await createDistributor(tokenB)
        const property = await createProperty(tokenA, distA.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenA}`)
            .send({ distributorId: distB.id })

        expect(response.status).toBe(403)
    })

    it("deve retornar 403 ao tentar atualizar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)
        const property = await createProperty(tokenA, distA.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 422 para UF inválida na atualização", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ state: "ZZ" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000")
            .send({ name: "X" })
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/properties/:id", () => {
    it("deve deletar a propriedade e retornar 204", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao tentar deletar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const distA = await createDistributor(tokenA)
        const property = await createProperty(tokenA, distA.id)

        const response = await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .delete("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete("/api/properties/00000000-0000-0000-0000-000000000000")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regra de integridade: distribuidora com propriedades vinculadas
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/distributors/:id — bloqueio com propriedades vinculadas", () => {
    it("deve retornar 409 ao tentar deletar distribuidora com propriedades vinculadas", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)
        await createProperty(token, dist.id)

        const response = await request(app)
            .delete(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(409)
        expect(response.body.status).toBe("error")
    })

    it("deve permitir deletar distribuidora sem propriedades vinculadas", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .delete(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
    })
})