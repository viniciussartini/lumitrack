import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// Nota: generateTestToken foi REMOVIDO propositalmente.
// O novo middleware authenticate consulta o banco para verificar se o token
// foi emitido via login real. Tokens gerados artificialmente nao existem na
// tabela auth_tokens e sao rejeitados com 401.
// Usar login real via POST /api/auth/login melhora a qualidade dos testes:
// eles agora cobrem o fluxo completo de autenticacao, nao um atalho artificial.

const app = createApp({ prismaClient: prismaHttpTest })

// --- Dados de apoio ---

const validIndividualBody = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "Joao",
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

// --- Helper de autenticacao ---

// Cria um usuario e faz login, retornando o userId e o token JWT real.
// Substituiu generateTestToken: o token agora existe na tabela auth_tokens.
async function registerAndLogin(body = validIndividualBody) {
    const createRes = await request(app).post("/api/users").send(body)
    const userId = createRes.body.data.id as string

    const loginRes = await request(app).post("/api/auth/login").send({
        email: body.email,
        password: body.password,
        channel: "WEB",
    })
    const token = loginRes.body.data.token as string

    return { userId, token }
}

// --- Setup e Teardown ---

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ---
// POST /api/users
// ---

describe("POST /api/users", () => {
    it("deve criar um usuario pessoa fisica e retornar 201", async () => {
        const response = await request(app)
            .post("/api/users")
            .send(validIndividualBody)

        expect(response.status).toBe(201)
        expect(response.body.status).toBe("success")
        expect(response.body.data.email).toBe("joao@example.com")
        expect(response.body.data.userType).toBe("INDIVIDUAL")
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve criar um usuario pessoa juridica e retornar 201", async () => {
        const response = await request(app)
            .post("/api/users")
            .send(validCompanyBody)

        expect(response.status).toBe(201)
        expect(response.body.data.userType).toBe("COMPANY")
        expect(response.body.data.companyName).toBe("Empresa Ltda")
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve retornar 422 para dados invalidos (e-mail malformado)", async () => {
        const response = await request(app)
            .post("/api/users")
            .send({ ...validIndividualBody, email: "nao-e-um-email" })

        expect(response.status).toBe(422)
        expect(response.body.status).toBe("error")
    })

    it("deve retornar 422 quando CPF for invalido", async () => {
        const response = await request(app)
            .post("/api/users")
            .send({ ...validIndividualBody, cpf: "111.111.111-11" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 quando senha nao atender os requisitos minimos", async () => {
        const response = await request(app)
            .post("/api/users")
            .send({ ...validIndividualBody, password: "123" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 409 ao tentar cadastrar e-mail ja existente", async () => {
        await request(app).post("/api/users").send(validIndividualBody)

        const response = await request(app)
            .post("/api/users")
            .send({ ...validIndividualBody, cpf: "310.037.856-38" })

        expect(response.status).toBe(409)
        expect(response.body.status).toBe("error")
    })

    it("deve retornar 422 quando pessoa fisica nao informar CPF", async () => {
        const { cpf: _cpf, ...bodyWithoutCpf } = validIndividualBody

        const response = await request(app)
            .post("/api/users")
            .send(bodyWithoutCpf)

        expect(response.status).toBe(422)
    })
})

// ---
// GET /api/users/:id
// ---

describe("GET /api/users/:id", () => {
    it("deve retornar 200 com os dados do usuario autenticado", async () => {
        const { userId, token } = await registerAndLogin()

        const response = await request(app)
            .get(`/api/users/${userId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(userId)
        expect(response.body.data).not.toHaveProperty("password")
    })

    it("deve retornar 401 quando nao houver token", async () => {
        const response = await request(app).get(
            "/api/users/00000000-0000-0000-0000-000000000000",
        )

        expect(response.status).toBe(401)
    })

    it("deve retornar 403 quando tentar acessar perfil de outro usuario", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/users/00000000-0000-0000-0000-000000000002")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 quando o usuario foi deletado e o token foi cascateado", async () => {
        // Este teste verifica um comportamento de seguranca importante:
        // o schema define onDelete: Cascade em AuthToken -> User, entao ao deletar
        // um usuario todos os seus tokens sao removidos do banco automaticamente.
        // Qualquer requisicao subsequente com esse token recebe 401 -- o middleware
        // nao encontra o registro em auth_tokens e rejeita a requisicao.
        //
        // Analogia: ao encerrar uma conta bancaria, todos os cartoes vinculados sao
        // cancelados automaticamente. Usar o cartao depois disso resulta em recusa
        // imediata -- o cartao pode ser fisicamente valido, mas o sistema ja nao o reconhece.
        //
        // O cenario "token valido mas usuario ausente no service resultando em 404"
        // ja e coberto pelos testes de servico (user.service.test.ts), onde controlamos
        // o banco diretamente sem o middleware no caminho.
        const { userId, token } = await registerAndLogin()

        await prismaHttpTest.user.delete({ where: { id: userId } })

        const response = await request(app)
            .get(`/api/users/${userId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(401)
    })
})

// ---
// PUT /api/users/:id
// ---

describe("PUT /api/users/:id", () => {
    it("deve atualizar os dados do usuario e retornar 200", async () => {
        const { userId, token } = await registerAndLogin()

        const response = await request(app)
            .put(`/api/users/${userId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ firstName: "Carlos", lastName: "Souza" })

        expect(response.status).toBe(200)
        expect(response.body.data.firstName).toBe("Carlos")
        expect(response.body.data.lastName).toBe("Souza")
    })

    it("deve retornar 401 quando nao houver token", async () => {
        const response = await request(app)
            .put("/api/users/00000000-0000-0000-0000-000000000000")
            .send({ firstName: "Carlos" })

        expect(response.status).toBe(401)
    })

    it("deve retornar 409 ao tentar atualizar para um e-mail ja existente", async () => {
        const { userId: firstId, token } = await registerAndLogin()

        await request(app)
            .post("/api/users")
            .send({ ...validCompanyBody, email: "segundo@example.com" })

        const response = await request(app)
            .put(`/api/users/${firstId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ email: "segundo@example.com" })

        expect(response.status).toBe(409)
    })
})

// ---
// DELETE /api/users/:id
// ---

describe("DELETE /api/users/:id", () => {
    it("deve deletar o usuario e retornar 204", async () => {
        const { userId, token } = await registerAndLogin()

        const response = await request(app)
            .delete(`/api/users/${userId}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        // Confirmamos que o usuario foi removido tentando fazer login com suas credenciais.
        // Apos o delete, o usuario nao existe mais no banco -- as credenciais sao invalidas.
        // Esta abordagem e mais correta do que tentar reutilizar o token, porque o
        // onDelete: Cascade remove o token junto com o usuario, resultando em 401 ao inves
        // de 404 se tentassemos usar o token antigo. O login testa o que realmente importa:
        // o usuario de fato deixou de existir no sistema.
        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({ email: validIndividualBody.email, password: validIndividualBody.password, channel: "WEB" })

        expect(loginResponse.status).toBe(401)
    })

    it("deve retornar 401 quando nao houver token", async () => {
        const response = await request(app).delete(
            "/api/users/00000000-0000-0000-0000-000000000000",
        )

        expect(response.status).toBe(401)
    })
})