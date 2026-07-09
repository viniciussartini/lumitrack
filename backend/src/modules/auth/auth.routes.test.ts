import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import request from "supertest"
import { createHash } from "node:crypto"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { env } from "@/config/env.js"
import { generate } from "otplib"

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
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Extrai o valor (ou a linha crua, para checar atributos) de um cookie
// específico do header Set-Cookie de uma resposta supertest.
function findSetCookieLine(response: request.Response, cookieName: string): string | undefined {
    const setCookie = response.headers["set-cookie"] as unknown as string[] | undefined
    return setCookie?.find((line) => line.startsWith(`${cookieName}=`))
}

function extractCookieValue(response: request.Response, cookieName: string): string {
    const line = findSetCookieLine(response, cookieName)
    if (!line) {
        throw new Error(`Cookie ${cookieName} não encontrado em Set-Cookie`)
    }
    return line.split(";")[0]!.split("=")[1]!
}

// MOBILE continua exatamente como antes — token Bearer no body do login.
async function registerAndLogin(channel: "WEB" | "MOBILE" = "WEB") {
    await request(app).post("/api/users").send(validUser)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: validUser.email,
        password: validUser.password,
        channel,
    })
    return loginRes.body.data.token as string
}

// WEB agora autentica via cookie httpOnly — usamos um `agent` do supertest
// para persistir cookies entre requisições (simula um browser real, que o
// `request(app)` simples não faz).
async function registerAndLoginWeb() {
    await request(app).post("/api/users").send(validUser)
    const agent = request.agent(app)
    const loginRes = await agent.post("/api/auth/login").send({
        email: validUser.email,
        password: validUser.password,
        channel: "WEB",
    })
    const csrfToken = extractCookieValue(loginRes, env.CSRF_COOKIE_NAME)
    return { agent, csrfToken, loginRes }
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
    it("deve retornar 200 e um token JWT com credenciais válidas (MOBILE)", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "MOBILE",
        })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        expect(response.body.data.token).toBeDefined()
        expect(response.body.data.token.split(".")).toHaveLength(3)
    })

    it("MOBILE não deve setar nenhum cookie", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "MOBILE",
        })

        expect(response.headers["set-cookie"]).toBeUndefined()
    })

    it("WEB deve retornar 200 sem token no body e setar os 4 cookies (sessão, CSRF, refresh, CSRF-refresh)", async () => {
        await request(app).post("/api/users").send(validUser)

        const response = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "WEB",
        })

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        // O JWT nunca aparece no body para WEB — só no cookie httpOnly.
        expect(response.body.data.token).toBeUndefined()

        const sessionCookie = findSetCookieLine(response, env.AUTH_COOKIE_NAME)
        const csrfCookie = findSetCookieLine(response, env.CSRF_COOKIE_NAME)
        const refreshCookie = findSetCookieLine(response, env.REFRESH_COOKIE_NAME)
        const refreshCsrfCookie = findSetCookieLine(response, env.REFRESH_CSRF_COOKIE_NAME)

        expect(sessionCookie).toBeDefined()
        expect(sessionCookie).toContain("HttpOnly")
        expect(sessionCookie).toContain("SameSite=Lax")
        expect(sessionCookie).toContain("Path=/")
        expect(sessionCookie).toMatch(/Max-Age=\d+/)
        // Secure só é ligado em produção — suíte roda com NODE_ENV=test.
        expect(sessionCookie).not.toContain("Secure")

        expect(csrfCookie).toBeDefined()
        expect(csrfCookie).not.toContain("HttpOnly")
        expect(csrfCookie).toContain("SameSite=Lax")

        expect(refreshCookie).toBeDefined()
        expect(refreshCookie).toContain("HttpOnly")
        // Cookies de refresh têm path restrito — browser só os envia em /api/auth.
        expect(refreshCookie).toContain("Path=/api/auth")

        expect(refreshCsrfCookie).toBeDefined()
        expect(refreshCsrfCookie).not.toContain("HttpOnly")
        expect(refreshCsrfCookie).toContain("Path=/api/auth")
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
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
    it("deve retornar 200 com os dados do usuário autenticado via cookie (WEB)", async () => {
        const { agent } = await registerAndLoginWeb()

        const response = await agent.get("/api/auth/me")

        expect(response.status).toBe(200)
        expect(response.body.data.email).toBe(validUser.email)
    })

    it("deve retornar 200 com os dados do usuário autenticado via Bearer (MOBILE)", async () => {
        const token = await registerAndLogin("MOBILE")

        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.email).toBe(validUser.email)
    })

    it("deve retornar 401 sem nenhuma credencial", async () => {
        const response = await request(app).get("/api/auth/me")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// CSRF (double-submit cookie) — só se aplica a requisições mutáveis
// autenticadas via cookie (canal WEB). Bearer (MOBILE) é isento.
// ─────────────────────────────────────────────────────────────────────────────

describe("CSRF (double-submit cookie)", () => {
    it("deve retornar 403 em requisição mutável via cookie sem header CSRF", async () => {
        const { agent } = await registerAndLoginWeb()

        const response = await agent.post("/api/auth/logout")

        expect(response.status).toBe(403)
    })

    it("deve retornar 403 em requisição mutável via cookie com header CSRF divergente do cookie", async () => {
        const { agent } = await registerAndLoginWeb()

        const response = await agent
            .post("/api/auth/logout")
            .set(env.CSRF_HEADER_NAME, "token-csrf-forjado-pelo-atacante")

        expect(response.status).toBe(403)
    })

    it("deve aceitar requisição mutável via cookie quando o header CSRF bate com o cookie", async () => {
        const { agent, csrfToken } = await registerAndLoginWeb()

        const response = await agent
            .post("/api/auth/logout")
            .set(env.CSRF_HEADER_NAME, csrfToken)

        expect(response.status).toBe(200)
    })

    it("não deve exigir CSRF em requisição mutável autenticada via Bearer (MOBILE)", async () => {
        const token = await registerAndLogin("MOBILE")

        const response = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
    })

    it("não deve exigir CSRF em requisição segura (GET) autenticada via cookie", async () => {
        const { agent } = await registerAndLoginWeb()

        const response = await agent.get("/api/auth/me")

        expect(response.status).toBe(200)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
    it("MOBILE: deve retornar 200 e revogar o token", async () => {
        const token = await registerAndLogin("MOBILE")

        const response = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
    })

    it("MOBILE: deve rejeitar requisições autenticadas com token revogado após logout", async () => {
        const token = await registerAndLogin("MOBILE")

        await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(401)
    })

    it("WEB: deve limpar os cookies de sessão e CSRF na resposta", async () => {
        const { agent, csrfToken } = await registerAndLoginWeb()

        const response = await agent
            .post("/api/auth/logout")
            .set(env.CSRF_HEADER_NAME, csrfToken)

        const sessionCookie = findSetCookieLine(response, env.AUTH_COOKIE_NAME)
        const csrfCookie = findSetCookieLine(response, env.CSRF_COOKIE_NAME)

        expect(sessionCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/)
        expect(csrfCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/)
    })

    it("WEB: deve rejeitar requisições autenticadas com cookie revogado após logout", async () => {
        const { agent, csrfToken } = await registerAndLoginWeb()

        await agent.post("/api/auth/logout").set(env.CSRF_HEADER_NAME, csrfToken)

        const response = await agent.get("/api/auth/me")

        expect(response.status).toBe(401)
    })

    it("deve retornar 401 quando não houver token", async () => {
        const response = await request(app).post("/api/auth/logout")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit log (#08 — A09): LOGIN/LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

describe("Audit log — login/logout", () => {
    it("registra LOGIN/SUCCESS ao logar com sucesso", async () => {
        await registerAndLogin("MOBILE")

        const logs = await prismaHttpTest.auditLog.findMany({ where: { action: "LOGIN" } })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ action: "LOGIN", outcome: "SUCCESS", resourceType: "User" })
        expect(logs[0]?.userId).not.toBeNull()
    })

    it("registra LOGIN/FAILURE (com userId null) ao errar a senha", async () => {
        await request(app).post("/api/users").send(validUser)

        await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: "SenhaErrada@999",
            channel: "WEB",
        })

        const logs = await prismaHttpTest.auditLog.findMany({ where: { action: "LOGIN" } })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ action: "LOGIN", outcome: "FAILURE", userId: null })
        expect((logs[0]?.metadata as { attemptedEmail?: string } | null)?.attemptedEmail).toBe(
            validUser.email,
        )
    })

    it("NÃO registra LOGIN para corpo malformado (422 — não é uma tentativa de login real)", async () => {
        await request(app).post("/api/auth/login").send({ email: validUser.email })

        const logs = await prismaHttpTest.auditLog.findMany({ where: { action: "LOGIN" } })
        expect(logs).toHaveLength(0)
    })

    it("registra LOGOUT/SUCCESS ao deslogar", async () => {
        const token = await registerAndLogin("MOBILE")

        await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`)

        const logs = await prismaHttpTest.auditLog.findMany({ where: { action: "LOGOUT" } })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ action: "LOGOUT", outcome: "SUCCESS", resourceType: "User" })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Expiração de token (#04 — MOBILE agora expira; token armazenado como hash)
// ─────────────────────────────────────────────────────────────────────────────

describe("Expiração de token", () => {
    it("deve persistir o hash do token (não o JWT puro) em auth_tokens", async () => {
        const { loginRes } = await registerAndLoginWeb()
        const sessionToken = extractCookieValue(loginRes, env.AUTH_COOKIE_NAME)

        const byRawToken = await prismaHttpTest.authToken.findUnique({ where: { token: sessionToken } })
        expect(byRawToken).toBeNull()

        const byHash = await prismaHttpTest.authToken.findUnique({
            where: { token: hashToken(sessionToken) },
        })
        expect(byHash).not.toBeNull()
    })

    it("deve retornar 401 para token MOBILE expirado (não dura mais para sempre)", async () => {
        const token = await registerAndLogin("MOBILE")

        // Simula a passagem do tempo: força o expiresAt para o passado.
        await prismaHttpTest.authToken.update({
            where: { token: hashToken(token) },
            data: { expiresAt: new Date(Date.now() - 1000) },
        })

        const response = await request(app)
            .get("/api/distributors")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(401)
        expect(response.body.message).toBe("Token expirado")
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
            channel: "MOBILE",
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

// ─────────────────────────────────────────────────────────────────────────────
// MFA (#12 — A06/A07)
// ─────────────────────────────────────────────────────────────────────────────

// Timeout maior que o default (5000ms) — habilitar o MFA hasheia 10 backup
// codes via bcrypt (BCRYPT_ROUNDS=12) e o fluxo HTTP completo (supertest +
// app real) soma overhead extra sobre o já visto em auth.service.test.ts.
describe("MFA", { timeout: 15000 }, () => {
    async function registerAndLoginMobile(): Promise<string> {
        await request(app).post("/api/users").send(validUser)
        const loginRes = await request(app).post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "MOBILE",
        })
        return loginRes.body.data.token as string
    }

    // Habilita o MFA via HTTP de ponta a ponta (setup → verify-setup) e
    // devolve o secret em texto claro + os backup codes, reaproveitados
    // pelos testes de login/disable.
    async function enableMfaViaHttp(token: string) {
        const setupRes = await request(app)
            .post("/api/auth/mfa/setup")
            .set("Authorization", `Bearer ${token}`)
        const { secret } = setupRes.body.data as { secret: string }
        const code = await generate({ secret })

        const verifyRes = await request(app)
            .post("/api/auth/mfa/verify-setup")
            .set("Authorization", `Bearer ${token}`)
            .send({ secret, code })

        return { secret, backupCodes: verifyRes.body.data.backupCodes as string[] }
    }

    describe("POST /api/auth/mfa/setup", () => {
        it("retorna 200 com secret e QR code data URL", async () => {
            const token = await registerAndLoginMobile()

            const response = await request(app)
                .post("/api/auth/mfa/setup")
                .set("Authorization", `Bearer ${token}`)

            expect(response.status).toBe(200)
            expect(response.body.data.secret).toBeTruthy()
            expect(response.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
        })

        it("retorna 401 sem token", async () => {
            const response = await request(app).post("/api/auth/mfa/setup")
            expect(response.status).toBe(401)
        })
    })

    describe("POST /api/auth/mfa/verify-setup", () => {
        it("retorna 200, habilita o MFA e devolve 10 backup codes", async () => {
            const token = await registerAndLoginMobile()
            const setupRes = await request(app)
                .post("/api/auth/mfa/setup")
                .set("Authorization", `Bearer ${token}`)
            const { secret } = setupRes.body.data as { secret: string }
            const code = await generate({ secret })

            const response = await request(app)
                .post("/api/auth/mfa/verify-setup")
                .set("Authorization", `Bearer ${token}`)
                .send({ secret, code })

            expect(response.status).toBe(200)
            expect(response.body.data.backupCodes).toHaveLength(10)

            const auditEntry = await prismaHttpTest.auditLog.findFirst({
                where: { action: "MFA_ENABLED" },
            })
            expect(auditEntry).not.toBeNull()
            expect(auditEntry?.outcome).toBe("SUCCESS")
        })

        it("retorna 401 para código inválido", async () => {
            const token = await registerAndLoginMobile()
            const setupRes = await request(app)
                .post("/api/auth/mfa/setup")
                .set("Authorization", `Bearer ${token}`)
            const { secret } = setupRes.body.data as { secret: string }

            const response = await request(app)
                .post("/api/auth/mfa/verify-setup")
                .set("Authorization", `Bearer ${token}`)
                .send({ secret, code: "000000" })

            expect(response.status).toBe(401)
        })
    })

    describe("login com MFA habilitado → POST /api/auth/login/mfa", () => {
        it("login retorna mfaRequired:true em vez de um token, quando o MFA está habilitado", async () => {
            const token = await registerAndLoginMobile()
            await enableMfaViaHttp(token)

            const response = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })

            expect(response.status).toBe(200)
            expect(response.body.data.mfaRequired).toBe(true)
            expect(response.body.data.mfaToken).toBeTruthy()
            expect(response.body.data.token).toBeUndefined()
        })

        it("completa o login com um código TOTP válido", async () => {
            const token = await registerAndLoginMobile()
            const { secret } = await enableMfaViaHttp(token)

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })
            const { mfaToken } = loginRes.body.data as { mfaToken: string }
            const code = await generate({ secret })

            const response = await request(app).post("/api/auth/login/mfa").send({ mfaToken, code })

            expect(response.status).toBe(200)
            expect(response.body.data.token).toBeTruthy()
        })

        it("completa o login com um backup code válido", async () => {
            const token = await registerAndLoginMobile()
            const { backupCodes } = await enableMfaViaHttp(token)

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })
            const { mfaToken } = loginRes.body.data as { mfaToken: string }

            const response = await request(app)
                .post("/api/auth/login/mfa")
                .send({ mfaToken, code: backupCodes[0] })

            expect(response.status).toBe(200)
            expect(response.body.data.token).toBeTruthy()
        })

        it("retorna 401 para código incorreto", async () => {
            const token = await registerAndLoginMobile()
            await enableMfaViaHttp(token)

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })
            const { mfaToken } = loginRes.body.data as { mfaToken: string }

            const response = await request(app)
                .post("/api/auth/login/mfa")
                .send({ mfaToken, code: "000000" })

            expect(response.status).toBe(401)
        })

        it("registra LOGIN/SUCCESS apenas ao completar o MFA, não na primeira etapa", async () => {
            const token = await registerAndLoginMobile() // 1 LOGIN/SUCCESS (sem MFA ainda)
            const { secret } = await enableMfaViaHttp(token)

            const countBeforeChallenge = await prismaHttpTest.auditLog.count({
                where: { action: "LOGIN", outcome: "SUCCESS" },
            })

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })

            // O desafio de MFA em si não gera um novo LOGIN/SUCCESS.
            const countAfterChallenge = await prismaHttpTest.auditLog.count({
                where: { action: "LOGIN", outcome: "SUCCESS" },
            })
            expect(countAfterChallenge).toBe(countBeforeChallenge)

            const { mfaToken } = loginRes.body.data as { mfaToken: string }
            const code = await generate({ secret })
            await request(app).post("/api/auth/login/mfa").send({ mfaToken, code })

            const countAfterCompletion = await prismaHttpTest.auditLog.count({
                where: { action: "LOGIN", outcome: "SUCCESS" },
            })
            expect(countAfterCompletion).toBe(countBeforeChallenge + 1)
        })
    })

    describe("POST /api/auth/mfa/disable", () => {
        it("retorna 200, desabilita o MFA e a conta deixa de exigi-lo no login", async () => {
            const token = await registerAndLoginMobile()
            const { secret } = await enableMfaViaHttp(token)
            const code = await generate({ secret })

            const response = await request(app)
                .post("/api/auth/mfa/disable")
                .set("Authorization", `Bearer ${token}`)
                .send({ password: validUser.password, code })

            expect(response.status).toBe(200)

            const auditEntry = await prismaHttpTest.auditLog.findFirst({
                where: { action: "MFA_DISABLED" },
            })
            expect(auditEntry).not.toBeNull()

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })
            expect(loginRes.body.data.mfaRequired).toBeUndefined()
            expect(loginRes.body.data.token).toBeTruthy()
        })

        it("retorna 401 para senha incorreta, sem desabilitar o MFA", async () => {
            const token = await registerAndLoginMobile()
            const { secret } = await enableMfaViaHttp(token)
            const code = await generate({ secret })

            const response = await request(app)
                .post("/api/auth/mfa/disable")
                .set("Authorization", `Bearer ${token}`)
                .send({ password: "SenhaErrada@123", code })

            expect(response.status).toBe(401)

            const loginRes = await request(app).post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })
            expect(loginRes.body.data.mfaRequired).toBe(true)
        })

        it("retorna 401 sem token", async () => {
            const response = await request(app)
                .post("/api/auth/mfa/disable")
                .send({ password: validUser.password, code: "123456" })

            expect(response.status).toBe(401)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/auth/refresh
    // ─────────────────────────────────────────────────────────────────────────
    describe("POST /api/auth/refresh", () => {
        async function loginWebWithAgent() {
            await request(app).post("/api/users").send(validUser)
            const agent = request.agent(app)
            const loginRes = await agent.post("/api/auth/login").send({
                email: validUser.email,
                password: validUser.password,
                channel: "WEB",
            })
            const csrfToken = extractCookieValue(loginRes, env.CSRF_COOKIE_NAME)
            const refreshCsrfToken = extractCookieValue(loginRes, env.REFRESH_CSRF_COOKIE_NAME)
            return { agent, csrfToken, refreshCsrfToken, loginRes }
        }

        it("retorna 401 sem o cookie de refresh", async () => {
            const response = await request(app).post("/api/auth/refresh")
            expect(response.status).toBe(401)
        })

        it("retorna 401 sem o header CSRF de refresh", async () => {
            const { agent } = await loginWebWithAgent()
            const response = await agent.post("/api/auth/refresh")
            expect(response.status).toBe(401)
        })

        it("retorna 200 e emite novos 4 cookies com CSRF de refresh válido", async () => {
            const { agent, refreshCsrfToken } = await loginWebWithAgent()

            const response = await agent
                .post("/api/auth/refresh")
                .set(env.REFRESH_CSRF_HEADER_NAME, refreshCsrfToken)

            expect(response.status).toBe(200)

            // Novos cookies devem ter sido setados
            const newSessionCookie = findSetCookieLine(response, env.AUTH_COOKIE_NAME)
            const newRefreshCookie = findSetCookieLine(response, env.REFRESH_COOKIE_NAME)
            expect(newSessionCookie).toBeDefined()
            expect(newRefreshCookie).toBeDefined()
        })

        it("após refresh, o refresh token antigo não funciona mais (fora da janela de graça)", async () => {
            const { agent, refreshCsrfToken, loginRes } = await loginWebWithAgent()

            // Executa o refresh
            await agent
                .post("/api/auth/refresh")
                .set(env.REFRESH_CSRF_HEADER_NAME, refreshCsrfToken)

            // Força o token original a estar fora da janela de graça
            const oldHash = createHash("sha256")
                .update(extractCookieValue(loginRes, env.REFRESH_COOKIE_NAME))
                .digest("hex")
            await prismaHttpTest.refreshToken.updateMany({
                where: { token: oldHash },
                data: { revokedAt: new Date(Date.now() - 60_000) },
            })

            // Tenta usar o cookie antigo de refresh (agent ainda o tem)
            // Com um novo agent sem os cookies atualizados
            const agent2 = request.agent(app)
            const oldRefreshValue = extractCookieValue(loginRes, env.REFRESH_COOKIE_NAME)
            const oldRefreshCsrfValue = extractCookieValue(loginRes, env.REFRESH_CSRF_COOKIE_NAME)
            const replayRes = await agent2
                .post("/api/auth/refresh")
                .set("Cookie", [
                    `${env.REFRESH_COOKIE_NAME}=${oldRefreshValue}`,
                    `${env.REFRESH_CSRF_COOKIE_NAME}=${oldRefreshCsrfValue}`,
                ])
                .set(env.REFRESH_CSRF_HEADER_NAME, oldRefreshCsrfValue)

            expect(replayRes.status).toBe(401)
        })

        it("logout limpa os 4 cookies incluindo refresh", async () => {
            const { agent, csrfToken } = await loginWebWithAgent()

            const logoutRes = await agent
                .post("/api/auth/logout")
                .set(env.CSRF_HEADER_NAME, csrfToken)

            expect(logoutRes.status).toBe(200)

            const cookies = logoutRes.headers["set-cookie"] as unknown as string[] | undefined
            const deletedNames = (cookies ?? [])
                .filter((c) => c.includes("Max-Age=0") || c.includes("Expires="))
                .map((c) => c.split("=")[0])

            expect(deletedNames).toContain(env.AUTH_COOKIE_NAME)
            expect(deletedNames).toContain(env.CSRF_COOKIE_NAME)
            expect(deletedNames).toContain(env.REFRESH_COOKIE_NAME)
            expect(deletedNames).toContain(env.REFRESH_CSRF_COOKIE_NAME)
        })
    })
})
