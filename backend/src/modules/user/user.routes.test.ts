import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { generateTestToken } from "@/shared/test/generate-test-token.js"

// Criamos o app uma única vez para todos os testes deste arquivo.
// O supertest usa o app Express diretamente — sem abrir porta nenhuma.
const app = createApp()

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validIndividualBody = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const validCompanyBody = {
    email: "contato@empresa.com",
    password: "Senha@123",
    userType: "COMPANY",
    companyName: "Empresa Ltda",
    cnpj: "11.222.333/0001-81",
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/users", () => {
    it("deve criar um usuário pessoa física e retornar 201", async () => {
        const response = await request(app)
        .post("/api/users")
        .send(validIndividualBody)

        expect(response.status).toBe(201)
        expect(response.body.status).toBe("success")
        expect(response.body.data.email).toBe("joao@example.com")
        expect(response.body.data.userType).toBe("INDIVIDUAL")
        // A senha nunca deve aparecer na resposta HTTP — nem como hash
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve criar um usuário pessoa jurídica e retornar 201", async () => {
        const response = await request(app)
        .post("/api/users")
        .send(validCompanyBody)

        expect(response.status).toBe(201)
        expect(response.body.data.userType).toBe("COMPANY")
        expect(response.body.data.companyName).toBe("Empresa Ltda")
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve retornar 422 para dados inválidos (e-mail malformado)", async () => {
        const response = await request(app)
        .post("/api/users")
        .send({ ...validIndividualBody, email: "nao-e-um-email" })

        expect(response.status).toBe(422)
        expect(response.body.status).toBe("error")
    })

    it("deve retornar 422 quando CPF for inválido", async () => {
        const response = await request(app)
        .post("/api/users")
        .send({ ...validIndividualBody, cpf: "111.111.111-11" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 quando senha não atender os requisitos mínimos", async () => {
        const response = await request(app)
        .post("/api/users")
        .send({ ...validIndividualBody, password: "123" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 409 ao tentar cadastrar e-mail já existente", async () => {
        // Primeiro cadastro — deve funcionar
        await request(app).post("/api/users").send(validIndividualBody)

        // Segundo cadastro com mesmo e-mail — deve falhar com 409
        const response = await request(app)
        .post("/api/users")
        .send({ ...validIndividualBody, cpf: "310.037.856-38" })

        expect(response.status).toBe(409)
        expect(response.body.status).toBe("error")
    })

    it("deve retornar 422 quando pessoa física não informar CPF", async () => {
        const { cpf: _cpf, ...bodyWithoutCpf } = validIndividualBody

        const response = await request(app)
        .post("/api/users")
        .send(bodyWithoutCpf)

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/:id", () => {
    it("deve retornar 200 com os dados do usuário autenticado", async () => {
        // Criamos o usuário via HTTP para ter o ID real
        const createResponse = await request(app)
        .post("/api/users")
        .send(validIndividualBody)

        const userId = createResponse.body.data.id as string

        // Geramos o token com o ID do usuário recém-criado
        const token = generateTestToken({
        id: userId,
        email: "joao@example.com",
        userType: "INDIVIDUAL",
        })

        const response = await request(app)
        .get(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(userId)
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app).get(
        "/api/users/00000000-0000-0000-0000-000000000000",
        )

        expect(response.status).toBe(401)
    })

    it("deve retornar 403 quando tentar acessar perfil de outro usuário", async () => {
        const token = generateTestToken({
        id: "00000000-0000-0000-0000-000000000001",
        email: "outro@example.com",
        userType: "INDIVIDUAL",
        })

        const response = await request(app)
        .get("/api/users/00000000-0000-0000-0000-000000000002")
        .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para usuário inexistente", async () => {
        const nonExistentId = "00000000-0000-0000-0000-000000000000"
        const token = generateTestToken({
        id: nonExistentId,
        email: "ghost@example.com",
        userType: "INDIVIDUAL",
        })

        const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/users/:id", () => {
    it("deve atualizar os dados do usuário e retornar 200", async () => {
        const createResponse = await request(app)
        .post("/api/users")
        .send(validIndividualBody)

        const userId = createResponse.body.data.id as string
        const token = generateTestToken({
        id: userId,
        email: "joao@example.com",
        userType: "INDIVIDUAL",
        })

        const response = await request(app)
        .put(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ firstName: "Carlos", lastName: "Souza" })

        expect(response.status).toBe(200)
        expect(response.body.data.firstName).toBe("Carlos")
        expect(response.body.data.lastName).toBe("Souza")
    })

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app)
        .put("/api/users/00000000-0000-0000-0000-000000000000")
        .send({ firstName: "Carlos" })

        expect(response.status).toBe(401)
    })

    it("deve retornar 409 ao tentar atualizar para um e-mail já existente", async () => {
        // Criamos dois usuários
        const firstResponse = await request(app)
        .post("/api/users")
        .send(validIndividualBody)

        await request(app)
        .post("/api/users")
        .send({ ...validCompanyBody, email: "segundo@example.com" })

        const firstId = firstResponse.body.data.id as string
        const token = generateTestToken({
        id: firstId,
        email: "joao@example.com",
        userType: "INDIVIDUAL",
        })

        // Tentamos atualizar o e-mail do primeiro para o e-mail do segundo
        const response = await request(app)
        .put(`/api/users/${firstId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "segundo@example.com" })

        expect(response.status).toBe(409)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/users/:id", () => {
    it("deve deletar o usuário e retornar 204", async () => {
        const createResponse = await request(app)
        .post("/api/users")
        .send(validIndividualBody)

        const userId = createResponse.body.data.id as string
        const token = generateTestToken({
        id: userId,
        email: "joao@example.com",
        userType: "INDIVIDUAL",
        })

        const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        // Confirmamos que o usuário foi mesmo removido tentando acessá-lo
        const getResponse = await request(app)
        .get(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app).delete(
        "/api/users/00000000-0000-0000-0000-000000000000",
        )

        expect(response.status).toBe(401)
    })
})