import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// O mock de e-mail é criado uma vez e injetado no app via createApp().
// Isso garante que nenhum e-mail real seja disparado durante os testes HTTP.
// A função é um spy: além de não fazer nada, registra todas as chamadas —
// útil se quisermos verificar que o e-mail foi "enviado" para o endereço certo.
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined)

const app = createApp({
    prismaClient: prismaHttpTest,
    sendPasswordResetEmail: mockSendPasswordResetEmail,
})

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(channel: "WEB" | "MOBILE" = "WEB") {
    await request(app).post("/api/users").send(validUser)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: validUser.email,
        password: validUser.password,
        channel,
    })
    return loginRes.body.data.token as string
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
    vi.clearAllMocks()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
    it("deve retornar 200 e um token JWT com credenciais válidas (WEB)", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "WEB",
        })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        expect(response.body.data.token).toBeDefined()
        expect(response.body.data.token.split(".")).toHaveLength(3)
    })

    it("deve retornar 200 e um token JWT com credenciais válidas (MOBILE)", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "MOBILE",
        })

        expect(response.status).toBe(200)
        expect(response.body.data.token).toBeDefined()
    })

    it("deve retornar 401 para e-mail inexistente", async () => {
        const response = await request(app).post("/api/auth/login").send({
            email: "naoexiste@example.com",
            password: "Senha@123",
            channel: "WEB",
        })

        expect(response.status).toBe(401)
        expect(response.body.status).toBe("error")
    })

    it("deve retornar 401 para senha incorreta", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: "SenhaErrada@999",
            channel: "WEB",
        })

        expect(response.status).toBe(401)
    })

    it("deve retornar 422 quando channel não for fornecido", async () => {
        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
        })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para channel inválido", async () => {
        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "TABLET",
        })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
    it("deve retornar 200 e revogar o token", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
    })

    it("deve rejeitar requisições autenticadas com token revogado após logout", async () => {
        const token = await registerAndLogin()

        await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        const payload = JSON.parse(
            Buffer.from(token.split(".")[1]!, "base64url").toString("utf-8"),
        ) as { id: string }

        const response = await request(app)
            .get(`/api/users/${payload.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(401)
    })

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app).post("/api/auth/logout")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
    it("deve retornar 200 para e-mail existente", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/forgot-password").send({
            email: validUser.email,
        })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        // Confirmamos que o mock de e-mail foi chamado — sem disparar nada real
        expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1)
    })

    it("deve retornar 200 para e-mail inexistente (user enumeration prevention)", async () => {
        const response = await request(app).post("/api/auth/forgot-password").send({
            email: "fantasma@example.com",
        })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        // E-mail não deve ter sido "enviado" — usuário não existe
        expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it("deve retornar 422 para e-mail com formato inválido", async () => {
        const response = await request(app).post("/api/auth/forgot-password").send({
            email: "nao-e-email",
        })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
    async function getResetToken(): Promise<string> {
        await request(app).post("/api/users").send(validUser)
        await request(app).post("/api/auth/forgot-password").send({ email: validUser.email })

        const reset = await prismaHttpTest.passwordReset.findFirst({
            where: { user: { email: validUser.email } },
            orderBy: { createdAt: "desc" },
        })

        return reset!.token
    }

    it("deve retornar 200 e permitir login com a nova senha após reset", async () => {
        const resetToken = await getResetToken()

        const resetResponse = await request(app).post("/api/auth/reset-password").send({
            token: resetToken,
            newPassword: "NovaSenha@456",
        })

        expect(resetResponse.status).toBe(200)

        const loginResponse = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: "NovaSenha@456",
            channel: "WEB",
        })

        expect(loginResponse.status).toBe(200)
        expect(loginResponse.body.data.token).toBeDefined()
    })

    it("deve retornar 400 para token inexistente", async () => {
        const response = await request(app).post("/api/auth/reset-password").send({
            token: "token-que-nao-existe",
            newPassword: "NovaSenha@456",
        })

        expect(response.status).toBe(400)
    })

    it("deve retornar 400 ao tentar usar o mesmo token duas vezes", async () => {
        const resetToken = await getResetToken()

        await request(app).post("/api/auth/reset-password").send({
            token: resetToken,
            newPassword: "NovaSenha@456",
        })

        const response = await request(app).post("/api/auth/reset-password").send({
            token: resetToken,
            newPassword: "OutraSenha@789",
        })

        expect(response.status).toBe(400)
    })

    it("deve retornar 422 quando nova senha não atender aos requisitos", async () => {
        const resetToken = await getResetToken()

        const response = await request(app).post("/api/auth/reset-password").send({
            token: resetToken,
            newPassword: "fraca",
        })

        expect(response.status).toBe(422)
    })
})