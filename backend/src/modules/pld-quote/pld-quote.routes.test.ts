import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

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

async function createQuote(overrides: {
    submarket?: "NORTH" | "NORTHEAST" | "SOUTHEAST_CENTER_WEST" | "SOUTH"
    referencePeriod?: Date
    valuePerMwh?: number
}) {
    return prismaHttpTest.pldQuote.create({
        data: {
            submarket: overrides.submarket ?? "SOUTHEAST_CENTER_WEST",
            referencePeriod: overrides.referencePeriod ?? new Date("2026-08-01"),
            valuePerMwh: overrides.valuePerMwh ?? 186.4,
        },
    })
}

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pld-quotes — catálogo global somente leitura
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/pld-quotes", () => {
    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/pld-quotes")
        expect(response.status).toBe(401)
    })

    it("deve retornar 200 com envelope paginado vazio quando o catálogo está vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar o catálogo compartilhado entre usuários diferentes", async () => {
        await createQuote({})
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].valuePerMwh).toBe(186.4)
    })

    it("deve filtrar por submercado", async () => {
        await createQuote({ submarket: "SOUTHEAST_CENTER_WEST" })
        await createQuote({ submarket: "NORTH", referencePeriod: new Date("2026-07-01") })
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes?submarket=NORTH")
            .set("Authorization", `Bearer ${token}`)

        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].submarket).toBe("NORTH")
    })

    it("deve paginar respeitando page e pageSize", async () => {
        for (let i = 1; i <= 3; i++) {
            await createQuote({ referencePeriod: new Date(`2026-0${i}-01`) })
        }
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes?page=1&pageSize=2")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(2)
        expect(response.body.data.total).toBe(3)
    })

    it("deve retornar 422 para submercado inválido", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes?submarket=LESTE")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para pageSize acima do teto (31)", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/pld-quotes?pageSize=100")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sem POST/PUT/DELETE — catálogo somente leitura, populado via seed
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/pld-quotes — não existe (catálogo somente leitura)", () => {
    it("deve retornar 404 (rota não existe)", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/pld-quotes")
            .set("Authorization", `Bearer ${token}`)
            .send({ submarket: "SOUTH", referencePeriod: "2026-08-01", valuePerMwh: 100 })

        expect(response.status).toBe(404)
    })
})
