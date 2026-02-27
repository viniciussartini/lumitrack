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
    taxRate: 0.12,
    publicLightingFee: 45.90,
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

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributors
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/distributors", () => {
    it("deve criar uma distribuidora e retornar 201 com campos numéricos", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send(validDistributorBody)

        expect(response.status).toBe(201)
        expect(response.body.status).toBe("success")
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.name).toBe("CEMIG Distribuição S.A.")

        // Campos Decimal devem ser serializado como number no JSON
        expect(typeof response.body.data.kwhPrice).toBe("number")
        expect(response.body.data.kwhPrice).toBe(0.75)
        expect(response.body.data.taxRate).toBe(0.12)
        expect(response.body.data.publicLightingFee).toBe(45.9)
    })

    it("deve criar uma distribuidora sem campos opcionais e retornar 201", async () => {
        const { token } = await registerAndLogin()
        const { taxRate: _tr, publicLightingFee: _plf, ...bodyWithoutOptionals } = validDistributorBody

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send(bodyWithoutOptionals)

        expect(response.status).toBe(201)
        expect(response.body.data.taxRate).toBeNull()
        expect(response.body.data.publicLightingFee).toBeNull()
    })

    it("deve retornar 401 sem token de autenticação", async () => {
        const response = await request(app)
            .post("/api/distributors")
            .send(validDistributorBody)

        expect(response.status).toBe(401)
    })

    it("deve retornar 409 ao cadastrar o mesmo CNPJ duas vezes para o mesmo usuário", async () => {
        const { token } = await registerAndLogin()
        await createDistributor(token)

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDistributorBody, name: "Duplicada" })

        expect(response.status).toBe(409)
    })

    it("deve retornar 201 ao mesmo CNPJ ser cadastrado por usuário diferente", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const responseA = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${tokenA}`)
            .send(validDistributorBody)

        const responseB = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validDistributorBody)

        expect(responseA.status).toBe(201)
        expect(responseB.status).toBe(201)
    })

    it("deve retornar 422 para CNPJ inválido", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDistributorBody, cnpj: "00.000.000/0000-00" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para tensão de trabalho inválida", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDistributorBody, workingVoltage: 9999 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para kwhPrice zero ou negativo", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDistributorBody, kwhPrice: 0 })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributors
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/distributors", () => {
    it("deve retornar 200 com lista vazia quando não há distribuidoras", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar 200 com lista de distribuidoras do usuário autenticado", async () => {
        const { token } = await registerAndLogin()
        await createDistributor(token)

        const response = await request(app)
            .get("/api/distributors")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
        expect(response.body.data[0].name).toBe("CEMIG Distribuição S.A.")
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/distributors")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributors/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/distributors/:id", () => {
    it("deve retornar 200 com os dados da distribuidora do usuário autenticado", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .get(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(dist.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar distribuidora de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const dist = await createDistributor(tokenA)

        const response = await request(app)
            .get(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/distributors/00000000-0000-0000-0000-000000000000")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/distributors/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/distributors/:id", () => {
    it("deve atualizar a distribuidora e retornar 200", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .put(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "CEMIG Atualizada", kwhPrice: 0.85 })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("CEMIG Atualizada")
        expect(response.body.data.kwhPrice).toBe(0.85)
    })

    it("deve retornar 403 ao tentar atualizar distribuidora de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const dist = await createDistributor(tokenA)

        const response = await request(app)
            .put(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .put("/api/distributors/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 422 para dados inválidos na atualização", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .put(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ kwhPrice: -10 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/distributors/00000000-0000-0000-0000-000000000000")
            .send({ name: "X" })

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/distributors/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/distributors/:id", () => {
    it("deve deletar a distribuidora e retornar 204", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor(token)

        const response = await request(app)
            .delete(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        // Confirma que foi removida
        const getResponse = await request(app)
            .get(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao tentar deletar distribuidora de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const dist = await createDistributor(tokenA)

        const response = await request(app)
            .delete(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .delete("/api/distributors/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete("/api/distributors/00000000-0000-0000-0000-000000000000")

        expect(response.status).toBe(401)
    })
})