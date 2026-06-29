import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { createAuthRateLimiter } from "@/shared/middlewares/rateLimiter.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined)

// O rate limit é desabilitado por padrão em ambiente de teste. Aqui forçamos
// um limiter estrito (limit=3, skip desligado) para validar o retorno 429.
const app = createApp({
    prismaClient: prismaHttpTest,
    sendPasswordResetEmail: mockSendPasswordResetEmail,
    authRateLimiter: createAuthRateLimiter({ limit: 3, skip: () => false }),
})

beforeEach(async () => {
    await cleanHttpDatabase()
    vi.clearAllMocks()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("Rate limiting — endpoints de autenticação", () => {
    it("deve retornar 429 após exceder o limite de tentativas de login", async () => {
        const credentials = {
            email: "bruteforce@example.com",
            password: "Senha@123",
            channel: "WEB",
        }

        // 3 tentativas dentro do limite — 401 por credenciais inválidas.
        for (let i = 0; i < 3; i++) {
            const res = await request(app).post("/api/auth/login").send(credentials)
            expect(res.status).toBe(401)
        }

        // 4ª tentativa deve ser bloqueada pelo rate limiter.
        const blocked = await request(app).post("/api/auth/login").send(credentials)
        expect(blocked.status).toBe(429)
        expect(blocked.body.status).toBe("error")
    })

    // #12 — /api/auth/login/mfa é o alvo natural de brute force de um código
    // TOTP de 6 dígitos (baixa entropia) e precisa do mesmo limiter estrito.
    // Confirma que o mount point "/api/auth/login" (semântica de prefixo do
    // Express) cobre "/api/auth/login/mfa" também, sem precisar de uma
    // segunda linha em app.ts.
    it("deve retornar 429 em /api/auth/login/mfa após exceder o limite", async () => {
        const body = { mfaToken: "token-invalido-qualquer", code: "000000" }

        for (let i = 0; i < 3; i++) {
            const res = await request(app).post("/api/auth/login/mfa").send(body)
            expect(res.status).toBe(401)
        }

        const blocked = await request(app).post("/api/auth/login/mfa").send(body)
        expect(blocked.status).toBe(429)
    })

    it("deve isolar a contagem por e-mail (alvo diferente não é bloqueado)", async () => {
        const base = { password: "Senha@123", channel: "WEB" as const }

        // Esgota o limite para um e-mail.
        for (let i = 0; i < 4; i++) {
            await request(app).post("/api/auth/login").send({ ...base, email: "alvo-a@example.com" })
        }

        // Outro e-mail ainda deve passar (chave IP+e-mail distinta) → 401, não 429.
        const other = await request(app)
            .post("/api/auth/login")
            .send({ ...base, email: "alvo-b@example.com" })

        expect(other.status).toBe(401)
    })
})
