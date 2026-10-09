import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { env } from "@/config/env.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

const app = createApp({ prismaClient: prismaHttpTest })

const CHROME_WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const FIREFOX_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"

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

interface SessionItem {
    id: string
    channel: "WEB" | "MOBILE"
    deviceLabel: string | null
    origin: string | null
    lastAccessAt: string
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

async function loginMobile(user = validUser, userAgent = FIREFOX_MAC): Promise<string> {
    const response = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", userAgent)
        .send({ email: user.email, password: user.password, channel: "MOBILE" })
    return response.body.data.token as string
}

async function loginWeb(user = validUser, userAgent = CHROME_WINDOWS) {
    const agent = request.agent(app)
    const response = await agent
        .post("/api/auth/login")
        .set("User-Agent", userAgent)
        .send({ email: user.email, password: user.password, channel: "WEB" })
    return { agent, refreshCsrf: cookieValue(response, env.REFRESH_CSRF_COOKIE_NAME) }
}

async function list(token: string): Promise<SessionItem[]> {
    const response = await request(app).get("/api/sessions").set(authed(token))
    expect(response.status).toBe(200)
    return response.body.data.items as SessionItem[]
}

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/sessions", () => {
    it("retorna 401 sem login", async () => {
        const response = await request(app).get("/api/sessions")
        expect(response.status).toBe(401)
    })

    it("lista a sessão do próprio login como atual, com dispositivo reduzido e IP mascarado", async () => {
        await register()
        const token = await loginMobile()

        const items = await list(token)

        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({
            channel: "MOBILE",
            deviceLabel: "Firefox · macOS",
            origin: "127.0.xx.xx",
            isCurrent: true,
        })
        expect(Number.isNaN(Date.parse(items[0]!.lastAccessAt))).toBe(false)
    })

    it("nunca devolve token, hash nem id de usuário", async () => {
        await register()
        const token = await loginMobile()
        const { agent } = await loginWeb()

        const mobileBody = await request(app).get("/api/sessions").set(authed(token))
        const webBody = await agent.get("/api/sessions")
        const serialized = JSON.stringify([mobileBody.body, webBody.body])

        const stored = await prismaHttpTest.authToken.findMany()
        for (const row of stored) expect(serialized).not.toContain(row.token)
        const refresh = await prismaHttpTest.refreshToken.findMany()
        for (const row of refresh) expect(serialized).not.toContain(row.token)
        const user = await prismaHttpTest.user.findFirstOrThrow()
        expect(serialized).not.toContain(user.id)
        expect(serialized).not.toContain(token)
        expect(Object.keys(mobileBody.body.data.items[0]).sort()).toEqual([
            "channel",
            "deviceLabel",
            "id",
            "isCurrent",
            "lastAccessAt",
            "origin",
        ])
    })

    it("marca como atual a sessão de quem pede, web ou mobile, e a põe primeiro", async () => {
        await register()
        const mobileToken = await loginMobile()
        const { agent } = await loginWeb()

        const fromMobile = await list(mobileToken)
        const fromWeb = (await agent.get("/api/sessions")).body.data.items as SessionItem[]

        expect(fromMobile).toHaveLength(2)
        expect(fromMobile[0]).toMatchObject({ channel: "MOBILE", isCurrent: true })
        expect(fromMobile[1]).toMatchObject({
            channel: "WEB",
            deviceLabel: "Chrome · Windows",
            isCurrent: false,
        })
        expect(fromWeb[0]).toMatchObject({ channel: "WEB", isCurrent: true })
        expect(fromWeb.filter((item) => item.isCurrent)).toHaveLength(1)
    })

    it("não lista sessões de outro usuário", async () => {
        await register()
        await register(anotherUser)
        const token = await loginMobile()
        await loginMobile(anotherUser)
        await loginWeb(anotherUser)

        const items = await list(token)

        expect(items).toHaveLength(1)
        expect(items[0]!.isCurrent).toBe(true)
    })

    it("deixa de fora a sessão revogada e a expirada", async () => {
        await register()
        const token = await loginMobile()
        await loginMobile()
        await loginMobile()
        const rows = await prismaHttpTest.authToken.findMany({ orderBy: { createdAt: "asc" } })
        await prismaHttpTest.authToken.update({
            where: { id: rows[1]!.id },
            data: { revokedAt: new Date() },
        })
        await prismaHttpTest.authToken.update({
            where: { id: rows[2]!.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
        })

        const items = await list(token)

        expect(items).toHaveLength(1)
    })

    it("uma sessão web rotacionada várias vezes aparece uma só vez, com o último acesso", async () => {
        await register()
        const { agent, refreshCsrf } = await loginWeb()

        const first = await agent
            .post("/api/auth/refresh")
            .set("User-Agent", FIREFOX_MAC)
            .set(env.REFRESH_CSRF_HEADER_NAME, refreshCsrf)
        const second = await agent
            .post("/api/auth/refresh")
            .set(env.REFRESH_CSRF_HEADER_NAME, cookieValue(first, env.REFRESH_CSRF_COOKIE_NAME))
        expect(second.status).toBe(200)

        const items = (await agent.get("/api/sessions")).body.data.items as SessionItem[]

        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({ channel: "WEB", isCurrent: true })
        const newest = await prismaHttpTest.refreshToken.findFirstOrThrow({
            where: { revokedAt: null },
        })
        expect(items[0]!.lastAccessAt).toBe(newest.createdAt.toISOString())
    })

    it("sessão antiga, sem origem registrada, vem com dispositivo e origem nulos", async () => {
        await register()
        const token = await loginMobile()
        await prismaHttpTest.authToken.updateMany({ data: { deviceLabel: null, origin: null } })

        const items = await list(token)

        expect(items[0]).toMatchObject({ deviceLabel: null, origin: null, isCurrent: true })
    })

    it("ordena as outras sessões da mais recente para a mais antiga", async () => {
        await register()
        const token = await loginMobile()
        await loginWeb()
        await loginMobile(validUser, CHROME_WINDOWS)
        const rows = await prismaHttpTest.authToken.findMany({
            where: { channel: "MOBILE" },
            orderBy: { createdAt: "asc" },
        })
        await prismaHttpTest.authToken.update({
            where: { id: rows[1]!.id },
            data: { createdAt: new Date(Date.now() + 60_000) },
        })

        const items = await list(token)
        const others = items.filter((item) => !item.isCurrent)

        expect(items[0]!.isCurrent).toBe(true)
        expect(Date.parse(others[0]!.lastAccessAt)).toBeGreaterThan(
            Date.parse(others[1]!.lastAccessAt),
        )
    })

    it("conta de demonstração recebe a lista representativa, sem sessões de outros visitantes", async () => {
        await register({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const token = await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        await loginMobile({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        await loginWeb({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const items = await list(token)

        expect(items).toHaveLength(3)
        expect(items[0]!.isCurrent).toBe(true)
        expect(items.filter((item) => item.isCurrent)).toHaveLength(1)
        const real = await prismaHttpTest.authToken.findMany()
        for (const row of real) expect(items.map((item) => item.id)).not.toContain(row.sessionId)
    })
})
