import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { env } from "@/config/env.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

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

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const unknownId = "00000000-0000-4000-8000-000000000000"

interface SessionItem {
    id: string
    channel: "WEB" | "MOBILE"
    isCurrent: boolean
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

const cookieValue = (response: request.Response, name: string): string => {
    const lines = response.headers["set-cookie"] as unknown as string[] | undefined
    const line = lines?.find((entry) => entry.startsWith(`${name}=`))
    if (!line) throw new Error(`Cookie ${name} não encontrado`)
    return line.split(";")[0]!.split("=")[1]!
}

async function register(user = validUser) {
    await request(app).post("/api/users").send(user)
}

interface MobileSession {
    token: string
    sessionId: string
}

async function loginMobile(user = validUser): Promise<MobileSession> {
    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password, channel: "MOBILE" })
    const token = response.body.data.token as string
    const items = await sessions(token)
    return { token, sessionId: items.find((item) => item.isCurrent)!.id }
}

interface WebSession {
    agent: ReturnType<typeof request.agent>
    csrf: string
    refreshCsrf: string
    jwt: string
    sessionId: string
}

async function loginWeb(user = validUser): Promise<WebSession> {
    const agent = request.agent(app)
    const response = await agent
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password, channel: "WEB" })
    const items = (await agent.get("/api/sessions")).body.data.items as SessionItem[]
    return {
        agent,
        csrf: cookieValue(response, env.CSRF_COOKIE_NAME),
        refreshCsrf: cookieValue(response, env.REFRESH_CSRF_COOKIE_NAME),
        jwt: cookieValue(response, env.AUTH_COOKIE_NAME),
        sessionId: items.find((item) => item.isCurrent)!.id,
    }
}

async function sessions(token: string): Promise<SessionItem[]> {
    const response = await request(app).get("/api/sessions").set(authed(token))
    return response.body.data.items as SessionItem[]
}

const revoke = (token: string, id: string) =>
    request(app).delete(`/api/sessions/${id}`).set(authed(token))

const revokeOthers = (token: string) =>
    request(app).post("/api/sessions/revoke-others").set(authed(token))

const auditRows = () => prismaHttpTest.auditLog.findMany({ where: { action: "SESSION_REVOKE" } })

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("DELETE /api/sessions/:id", () => {
    it("retorna 401 sem login", async () => {
        const response = await request(app).delete(`/api/sessions/${unknownId}`)
        expect(response.status).toBe(401)
    })

    it("retorna 422 para um id que não é uuid", async () => {
        await register()
        const { token } = await loginMobile()

        const response = await revoke(token, "nao-e-uuid")

        expect(response.status).toBe(422)
    })

    it("retorna 404 para uma sessão que não existe", async () => {
        await register()
        const { token } = await loginMobile()

        const response = await revoke(token, unknownId)

        expect(response.status).toBe(404)
        expect(await auditRows()).toHaveLength(0)
    })

    it("não encerra sessão de outro usuário e responde como se ela não existisse", async () => {
        await register()
        await register(anotherUser)
        const mine = await loginMobile()
        const theirs = await loginMobile(anotherUser)

        const response = await revoke(mine.token, theirs.sessionId)

        expect(response.status).toBe(404)
        expect((await sessions(theirs.token)).map((item) => item.id)).toContain(theirs.sessionId)
        expect(await auditRows()).toHaveLength(0)
    })

    it("não encerra a sessão web de outro usuário", async () => {
        await register()
        await register(anotherUser)
        const mine = await loginMobile()
        const theirs = await loginWeb(anotherUser)

        const response = await revoke(mine.token, theirs.sessionId)

        expect(response.status).toBe(404)
        expect((await theirs.agent.get("/api/sessions")).status).toBe(200)
    })

    it("encerra uma sessão mobile: o token dela falha na próxima chamada", async () => {
        await register()
        const mine = await loginMobile()
        const other = await loginMobile()

        const response = await revoke(mine.token, other.sessionId)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual({ endedCurrent: false })
        expect((await request(app).get("/api/sessions").set(authed(other.token))).status).toBe(401)
        expect((await sessions(mine.token)).map((item) => item.id)).toEqual([mine.sessionId])
    })

    it("encerra uma sessão web: o JWT, os anteriores a um refresh e o refresh token falham", async () => {
        await register()
        const mine = await loginMobile()
        const web = await loginWeb()
        const renewed = await web.agent
            .post("/api/auth/refresh")
            .set(env.REFRESH_CSRF_HEADER_NAME, web.refreshCsrf)
        const newJwt = cookieValue(renewed, env.AUTH_COOKIE_NAME)
        const newRefreshCsrf = cookieValue(renewed, env.REFRESH_CSRF_COOKIE_NAME)

        const response = await revoke(mine.token, web.sessionId)

        expect(response.status).toBe(200)
        for (const jwt of [web.jwt, newJwt]) {
            expect((await request(app).get("/api/sessions").set(authed(jwt))).status).toBe(401)
        }
        const refresh = await web.agent
            .post("/api/auth/refresh")
            .set(env.REFRESH_CSRF_HEADER_NAME, newRefreshCsrf)
        expect(refresh.status).toBe(401)
        expect(
            await prismaHttpTest.refreshToken.count({
                where: { sessionId: web.sessionId, revokedAt: null },
            }),
        ).toBe(0)
        expect(
            await prismaHttpTest.authToken.count({
                where: { sessionId: web.sessionId, revokedAt: null },
            }),
        ).toBe(0)
    })

    it("o refresh do aparelho encerrado não derruba as outras sessões", async () => {
        await register()
        const mine = await loginMobile()
        const web = await loginWeb()
        const survivor = await loginWeb()
        await revoke(mine.token, web.sessionId)

        const refresh = await web.agent
            .post("/api/auth/refresh")
            .set(env.REFRESH_CSRF_HEADER_NAME, web.refreshCsrf)

        expect(refresh.status).toBe(401)
        expect((await request(app).get("/api/sessions").set(authed(mine.token))).status).toBe(200)
        expect((await survivor.agent.get("/api/sessions")).status).toBe(200)
        expect(
            await prismaHttpTest.auditLog.count({
                where: { action: "REFRESH_TOKEN_REUSE_DETECTED" },
            }),
        ).toBe(0)
    })

    it("sessão já encerrada responde 404", async () => {
        await register()
        const mine = await loginMobile()
        const other = await loginMobile()
        await revoke(mine.token, other.sessionId)

        const again = await revoke(mine.token, other.sessionId)

        expect(again.status).toBe(404)
    })

    it("encerrar a sessão atual funciona como logout: limpa os cookies e o acesso cai", async () => {
        await register()
        const web = await loginWeb()

        const response = await web.agent
            .delete(`/api/sessions/${web.sessionId}`)
            .set(env.CSRF_HEADER_NAME, web.csrf)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual({ endedCurrent: true })
        const cleared = (response.headers["set-cookie"] as unknown as string[]).filter((line) =>
            /Expires=Thu, 01 Jan 1970/.test(line),
        )
        expect(cleared.length).toBeGreaterThanOrEqual(4)
        expect((await web.agent.get("/api/sessions")).status).toBe(401)
    })

    it("por cookie, exige o token CSRF", async () => {
        await register()
        const web = await loginWeb()

        const response = await web.agent.delete(`/api/sessions/${web.sessionId}`)

        expect(response.status).toBe(403)
        expect((await web.agent.get("/api/sessions")).status).toBe(200)
    })

    it("bloqueia conta de demonstração", async () => {
        await register({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const demo = await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const other = await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await revoke(demo.token, other.sessionId)

        expect(response.status).toBe(403)
        expect((await request(app).get("/api/sessions").set(authed(other.token))).status).toBe(200)
    })

    it("registra uma linha de auditoria, sem token", async () => {
        await register()
        const mine = await loginMobile()
        const other = await loginMobile()

        await revoke(mine.token, other.sessionId)

        const rows = await auditRows()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            outcome: "SUCCESS",
            resourceType: "Session",
            resourceId: other.sessionId,
            metadata: { scope: "one", count: 1 },
        })
        const serialized = JSON.stringify(rows)
        expect(serialized).not.toContain(mine.token)
        expect(serialized).not.toContain(other.token)
    })
})

describe("POST /api/sessions/revoke-others", () => {
    it("retorna 401 sem login", async () => {
        const response = await request(app).post("/api/sessions/revoke-others")
        expect(response.status).toBe(401)
    })

    it("encerra todas as outras e preserva a atual", async () => {
        await register()
        const mine = await loginMobile()
        const other = await loginMobile()
        const web = await loginWeb()

        const response = await revokeOthers(mine.token)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual({ revoked: 2 })
        expect((await request(app).get("/api/sessions").set(authed(other.token))).status).toBe(401)
        expect((await web.agent.get("/api/sessions")).status).toBe(401)
        expect((await sessions(mine.token)).map((item) => item.id)).toEqual([mine.sessionId])
    })

    it("a sessão web atual segue renovando o refresh depois de encerrar as outras", async () => {
        await register()
        const mobile = await loginMobile()
        const web = await loginWeb()

        await web.agent.post("/api/sessions/revoke-others").set(env.CSRF_HEADER_NAME, web.csrf)

        const refresh = await web.agent
            .post("/api/auth/refresh")
            .set(env.REFRESH_CSRF_HEADER_NAME, web.refreshCsrf)
        expect(refresh.status).toBe(200)
        expect((await request(app).get("/api/sessions").set(authed(mobile.token))).status).toBe(401)
    })

    it("não encerra sessões de outro usuário", async () => {
        await register()
        await register(anotherUser)
        const mine = await loginMobile()
        const theirs = await loginMobile(anotherUser)
        await loginMobile()

        await revokeOthers(mine.token)

        expect((await request(app).get("/api/sessions").set(authed(theirs.token))).status).toBe(200)
    })

    it("sem outras sessões, não revoga nada e preserva a atual", async () => {
        await register()
        const mine = await loginMobile()

        const response = await revokeOthers(mine.token)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual({ revoked: 0 })
        expect((await sessions(mine.token)).map((item) => item.id)).toEqual([mine.sessionId])
    })

    it("bloqueia conta de demonstração", async () => {
        await register({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const demo = await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const other = await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await revokeOthers(demo.token)

        expect(response.status).toBe(403)
        expect((await request(app).get("/api/sessions").set(authed(other.token))).status).toBe(200)
    })

    it("registra uma linha de auditoria com o total", async () => {
        await register()
        const mine = await loginMobile()
        await loginMobile()
        await loginMobile()

        await revokeOthers(mine.token)

        const rows = await auditRows()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            resourceType: "Session",
            metadata: { scope: "others", count: 2 },
        })
    })
})
