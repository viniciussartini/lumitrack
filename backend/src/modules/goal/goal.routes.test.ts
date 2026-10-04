import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
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

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

async function setupProperty(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)
    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })
    return { token, propertyId: propRes.body.data.id as string }
}

// Ano corrente em São Paulo, como o serviço o calcula.
const currentYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(
        new Date(),
    ),
)

const body = (propertyId: string, override: Record<string, unknown> = {}) => ({
    propertyId,
    year: currentYear,
    referenceYear: currentYear - 1,
    monthlyKwh: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    ...override,
})

const editable = (override: Record<string, unknown> = {}) => ({
    referenceYear: currentYear - 1,
    monthlyKwh: Array.from({ length: 12 }, () => 500),
    alertPercent: 90,
    ...override,
})

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("POST /api/goals", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).post("/api/goals").send(body(unknownId))
        expect(response.status).toBe(401)
    })

    it("cria a meta e não devolve o userId", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/goals")
            .set(authed(token))
            .send(body(propertyId))

        expect(response.status).toBe(201)
        expect(response.body.data).toMatchObject({
            propertyId,
            year: currentYear,
            referenceYear: currentYear - 1,
            alertPercent: 85,
        })
        expect(response.body.data.monthlyKwh).toHaveLength(12)
        expect(response.body.data.userId).toBeUndefined()
    })

    it.each([
        ["11 meses", { monthlyKwh: Array.from({ length: 11 }, () => 400) }],
        ["mês negativo", { monthlyKwh: [-1, ...Array.from({ length: 11 }, () => 400)] }],
        ["alerta abaixo de 10", { alertPercent: 9 }],
        ["alerta acima de 100", { alertPercent: 101 }],
        ["referência igual ao ano da meta", { referenceYear: currentYear }],
        ["ano passado", { year: currentYear - 1, referenceYear: currentYear - 2 }],
    ])("retorna 422 para %s", async (_label, override) => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/goals")
            .set(authed(token))
            .send(body(propertyId, override))

        expect(response.status).toBe(422)
        expect(await prismaHttpTest.goal.count()).toBe(0)
    })

    it("retorna 409 para um segundo cadastro do mesmo ano", async () => {
        const { token, propertyId } = await setupProperty()
        await request(app).post("/api/goals").set(authed(token)).send(body(propertyId))

        const response = await request(app)
            .post("/api/goals")
            .set(authed(token))
            .send(body(propertyId))

        expect(response.status).toBe(409)
        expect(await prismaHttpTest.goal.count()).toBe(1)
    })

    it("retorna 404 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupProperty(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/goals")
            .set(authed(tokenB))
            .send(body(propertyId))

        expect(response.status).toBe(404)
        expect(await prismaHttpTest.goal.count()).toBe(0)
    })

    it("bloqueia conta de demonstração", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await request(app)
            .post("/api/goals")
            .set(authed(demoToken))
            .send(body(unknownId))

        expect(response.status).toBe(403)
        expect(await prismaHttpTest.goal.count()).toBe(0)
    })
})

describe("GET /api/goals", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get(`/api/goals?propertyId=${unknownId}`)
        expect(response.status).toBe(401)
    })

    it("exige a propriedade", async () => {
        const token = await registerAndLogin()

        const response = await request(app).get("/api/goals").set(authed(token))

        expect(response.status).toBe(422)
    })

    it("lista as metas da propriedade, do ano mais recente para o mais antigo", async () => {
        const { token, propertyId } = await setupProperty()
        for (const year of [currentYear, currentYear + 2, currentYear + 1]) {
            await request(app)
                .post("/api/goals")
                .set(authed(token))
                .send(body(propertyId, { year, referenceYear: currentYear - 1 }))
        }

        const response = await request(app)
            .get(`/api/goals?propertyId=${propertyId}`)
            .set(authed(token))

        expect(response.status).toBe(200)
        expect(response.body.data.items.map((g: { year: number }) => g.year)).toEqual([
            currentYear + 2,
            currentYear + 1,
            currentYear,
        ])
        expect(response.body.data.total).toBe(3)
        expect(response.body.data.items[0].userId).toBeUndefined()
    })

    it("não lista as metas de propriedade alheia", async () => {
        const { token: tokenA, propertyId } = await setupProperty(validUser)
        await request(app).post("/api/goals").set(authed(tokenA)).send(body(propertyId))
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/goals?propertyId=${propertyId}`)
            .set(authed(tokenB))

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
    })
})

describe("PUT /api/goals/:id", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).put(`/api/goals/${unknownId}`).send(editable())
        expect(response.status).toBe(401)
    })

    it("edita os valores e mantém ano e propriedade", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/goals")
            .set(authed(token))
            .send(body(propertyId))

        const response = await request(app)
            .put(`/api/goals/${created.body.data.id}`)
            .set(authed(token))
            .send(editable({ year: 1999, propertyId: unknownId }))

        expect(response.status).toBe(200)
        expect(response.body.data).toMatchObject({
            year: currentYear,
            propertyId,
            alertPercent: 90,
        })
        expect(response.body.data.monthlyKwh[0]).toBe(500)
    })

    it("retorna 409 para meta de ano passado e não altera nada", async () => {
        const { token, propertyId } = await setupProperty()
        const user = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        const past = await prismaHttpTest.goal.create({
            data: {
                userId: user.id,
                propertyId,
                year: currentYear - 1,
                referenceYear: currentYear - 2,
                monthlyKwh: Array.from({ length: 12 }, () => 400),
                alertPercent: 85,
            },
        })

        const response = await request(app)
            .put(`/api/goals/${past.id}`)
            .set(authed(token))
            .send(editable())

        expect(response.status).toBe(409)
        const stored = await prismaHttpTest.goal.findUniqueOrThrow({ where: { id: past.id } })
        expect(stored.alertPercent).toBe(85)
    })

    it("retorna 404 para meta de outro usuário", async () => {
        const { token: tokenA, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/goals")
            .set(authed(tokenA))
            .send(body(propertyId))
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/goals/${created.body.data.id}`)
            .set(authed(tokenB))
            .send(editable())

        expect(response.status).toBe(404)
    })

    it("bloqueia conta de demonstração", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await request(app)
            .put(`/api/goals/${unknownId}`)
            .set(authed(demoToken))
            .send(editable())

        expect(response.status).toBe(403)
    })
})

describe("DELETE /api/goals/:id", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).delete(`/api/goals/${unknownId}`)
        expect(response.status).toBe(401)
    })

    it("exclui a meta", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/goals")
            .set(authed(token))
            .send(body(propertyId))

        const response = await request(app)
            .delete(`/api/goals/${created.body.data.id}`)
            .set(authed(token))

        expect(response.status).toBe(204)
        expect(await prismaHttpTest.goal.count()).toBe(0)
    })

    it("retorna 409 para meta de ano passado", async () => {
        const { token, propertyId } = await setupProperty()
        const user = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        const past = await prismaHttpTest.goal.create({
            data: {
                userId: user.id,
                propertyId,
                year: currentYear - 1,
                referenceYear: currentYear - 2,
                monthlyKwh: Array.from({ length: 12 }, () => 400),
                alertPercent: 85,
            },
        })

        const response = await request(app).delete(`/api/goals/${past.id}`).set(authed(token))

        expect(response.status).toBe(409)
        expect(await prismaHttpTest.goal.count()).toBe(1)
    })

    it("retorna 404 para meta de outro usuário", async () => {
        const { token: tokenA, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/goals")
            .set(authed(tokenA))
            .send(body(propertyId))
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/goals/${created.body.data.id}`)
            .set(authed(tokenB))

        expect(response.status).toBe(404)
        expect(await prismaHttpTest.goal.count()).toBe(1)
    })

    it("bloqueia conta de demonstração", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await request(app).delete(`/api/goals/${unknownId}`).set(authed(demoToken))

        expect(response.status).toBe(403)
    })
})

describe("exclusão em cascata", () => {
    it("excluir a propriedade leva as metas junto", async () => {
        const { token, propertyId } = await setupProperty()
        await request(app).post("/api/goals").set(authed(token)).send(body(propertyId))

        await request(app).delete(`/api/properties/${propertyId}`).set(authed(token))

        expect(await prismaHttpTest.goal.count()).toBe(0)
    })
})
