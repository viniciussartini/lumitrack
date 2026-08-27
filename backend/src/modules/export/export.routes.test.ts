import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { waitFor } from "@/shared/test/waitFor.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (cookie httpOnly).
async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

// Cria user → distributor (catálogo, inserido direto no banco) → property,
// para que o export tenha algo a agregar.
async function setupWithProperty(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })

    return { token, propertyId: propRes.body.data.id as string }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/me/data-export", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/users/me/data-export")
        expect(response.status).toBe(401)
    })

    it("retorna 200 com JSON por padrão (sem ?format)", async () => {
        const { token, propertyId } = await setupWithProperty()

        const response = await request(app)
            .get("/api/users/me/data-export")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.headers["content-type"]).toContain("application/json")
        expect(response.headers["content-disposition"]).toContain("attachment")
        expect(response.headers["content-disposition"]).toContain(".json")
        expect(response.body.status).toBe("success")
        expect(response.body.data.user.email).toBe(validUser.email)
        expect(response.body.data.properties).toHaveLength(1)
        expect(response.body.data.properties[0].id).toBe(propertyId)
    })

    it("retorna 200 com JSON quando ?format=json explícito", async () => {
        const { token } = await setupWithProperty()

        const response = await request(app)
            .get("/api/users/me/data-export?format=json")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.headers["content-type"]).toContain("application/json")
    })

    it("retorna 200 com PDF quando ?format=pdf", async () => {
        const { token } = await setupWithProperty()

        const response = await request(app)
            .get("/api/users/me/data-export?format=pdf")
            .set("Authorization", `Bearer ${token}`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks: Buffer[] = []
                res.on("data", (chunk: Buffer) => chunks.push(chunk))
                res.on("end", () => callback(null, Buffer.concat(chunks)))
            })

        expect(response.status).toBe(200)
        expect(response.headers["content-type"]).toContain("application/pdf")
        expect(response.headers["content-disposition"]).toContain("attachment")
        expect(response.headers["content-disposition"]).toContain(".pdf")

        const body = response.body as Buffer
        expect(Buffer.isBuffer(body)).toBe(true)
        expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("retorna 422 para ?format inválido", async () => {
        const { token } = await setupWithProperty()

        const response = await request(app)
            .get("/api/users/me/data-export?format=xml")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("isola os dados entre usuários — export de A não inclui nada de B", async () => {
        const { propertyId: propertyIdA } = await setupWithProperty(validUser)
        const { token: tokenB } = await setupWithProperty(anotherUser)

        const response = await request(app)
            .get("/api/users/me/data-export")
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(200)
        const propertyIds = response.body.data.properties.map((p: { id: string }) => p.id)
        expect(propertyIds).not.toContain(propertyIdA)
    })

    it("registra um audit log DATA_EXPORT após a exportação", async () => {
        const { token } = await setupWithProperty()

        const response = await request(app)
            .get("/api/users/me/data-export")
            .set("Authorization", `Bearer ${token}`)

        const userId = response.body.data.user.id as string

        // O controller registra este audit log DEPOIS de enviar a resposta
        // (decisão de latência) — a escrita corre em paralelo ao fim do
        // request acima, sem ordem garantida.
        const auditEntry = await waitFor(() =>
            prismaHttpTest.auditLog.findFirst({
                where: { userId, action: "DATA_EXPORT" },
            }),
        )

        expect(auditEntry).not.toBeNull()
        expect(auditEntry?.outcome).toBe("SUCCESS")
    })
})
