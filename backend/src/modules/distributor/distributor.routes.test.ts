import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

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

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributors — catálogo global somente leitura
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/distributors", () => {
    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/distributors")
        expect(response.status).toBe(401)
    })

    it("deve retornar 200 com envelope paginado vazio quando o catálogo está vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar o catálogo compartilhado entre usuários diferentes", async () => {
        await createTestDistributor(prismaHttpTest, { name: "CEMIG Distribuição S.A." })
        const tokenA = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].name).toBe("CEMIG Distribuição S.A.")
    })

    it("deve paginar respeitando page e pageSize", async () => {
        for (let i = 0; i < 3; i++) {
            await createTestDistributor(prismaHttpTest, { name: `Dist ${i}` })
        }
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors?page=1&pageSize=2")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(2)
        expect(response.body.data.total).toBe(3)
    })

    it("deve retornar 422 para pageSize acima do teto (31)", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors?pageSize=100")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributors/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/distributors/:id", () => {
    it("deve retornar 200 com os dados da distribuidora para qualquer usuário autenticado", async () => {
        const dist = await createTestDistributor(prismaHttpTest)
        const token = await registerAndLogin()

        const response = await request(app)
            .get(`/api/distributors/${dist.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(dist.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/distributors/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get(
            "/api/distributors/00000000-0000-0000-0000-000000000000",
        )

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Não há mais POST/PUT/DELETE — distribuidora é catálogo somente leitura
// ─────────────────────────────────────────────────────────────────────────────

describe("POST/PUT/DELETE /api/distributors — removidos (catálogo somente leitura)", () => {
    it("POST deve retornar 404 (rota não existe mais)", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(404)
    })
})
