import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"
import { MAX_SCHEDULES_PER_USER } from "@/modules/report-schedule/report-schedule.schema.js"

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

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

// Propriedade com medidor, e uma área sem medidor.
async function setupProperty(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)
    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })
    const propertyId = propRes.body.data.id as string
    await prismaHttpTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/geral",
        },
    })
    const area = await prismaHttpTest.area.create({ data: { propertyId, name: "Garagem" } })
    return { token, propertyId, areaWithoutMeterId: area.id }
}

const body = (targetId: string, override: Record<string, unknown> = {}) => ({
    targetType: "PROPERTY",
    targetId,
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: ["financeiro@example.com"],
    ...override,
})

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("POST /api/report-schedules", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app)
            .post("/api/report-schedules")
            .send(body("00000000-0000-4000-8000-000000000000"))
        expect(response.status).toBe(401)
    })

    it("cria a configuração, ativa por padrão, com a próxima execução e sem o userId", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        expect(response.status).toBe(201)
        expect(response.body.data).toMatchObject({
            targetType: "PROPERTY",
            targetId: propertyId,
            type: "CONSUMPTION",
            format: "PDF",
            frequency: "MONTHLY",
            sendDay: 5,
            recipients: ["financeiro@example.com"],
            active: true,
        })
        expect(response.body.data.userId).toBeUndefined()
        expect(new Date(response.body.data.nextRunAt).getTime()).toBeGreaterThan(Date.now())
        // Todo envio sai às 06:00 de São Paulo (09:00 UTC).
        expect(new Date(response.body.data.nextRunAt).getUTCHours()).toBe(9)
    })

    it("configuração pausada não tem próxima execução", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, { active: false }))

        expect(response.status).toBe(201)
        expect(response.body.data.active).toBe(false)
        expect(response.body.data.nextRunAt).toBeNull()
    })

    it("frequência diária não tem dia de envio", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, { frequency: "DAILY", sendDay: null }))

        expect(response.status).toBe(201)
        expect(response.body.data.sendDay).toBeNull()
    })

    it("normaliza e deduplica os destinatários", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, { recipients: ["A@Example.com", "a@example.com"] }))

        expect(response.body.data.recipients).toEqual(["a@example.com"])
    })

    it.each([
        ["destinatário inválido", { recipients: ["sem-arroba"] }],
        ["sem destinatários", { recipients: [] }],
        ["dia fora da faixa", { sendDay: 32 }],
        ["mensal com frequência semanal", { type: "MONTHLY", frequency: "WEEKLY", sendDay: 1 }],
        ["demanda com frequência semanal", { type: "DEMAND", frequency: "WEEKLY", sendDay: 1 }],
        ["demanda para propriedade do Grupo B", { type: "DEMAND", frequency: "MONTHLY" }],
        ["tipo desconhecido", { type: "OUTRO" }],
    ])("retorna 422 para %s", async (_label, override) => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, override))

        expect(response.status).toBe(422)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(0)
    })

    it.each(["ALERTS", "POWER_QUALITY"])("aceita o tipo %s", async (type) => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, { type }))

        expect(response.status).toBe(201)
        expect(response.body.data.type).toBe(type)
    })

    it("retorna 403 para alvo de outro usuário", async () => {
        const { propertyId } = await setupProperty(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(tokenB))
            .send(body(propertyId))

        expect(response.status).toBe(403)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(0)
    })

    it("retorna 404 quando o alvo não tem medidor", async () => {
        const { token, areaWithoutMeterId } = await setupProperty()

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(areaWithoutMeterId, { targetType: "AREA" }))

        expect(response.status).toBe(404)
    })

    it("bloqueia conta de demonstração (não pode guardar e-mail de terceiro)", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(demoToken))
            .send(body("00000000-0000-4000-8000-000000000000"))

        expect(response.status).toBe(403)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(0)
    })

    it("recusa passar do teto de configurações por usuário", async () => {
        const { token, propertyId } = await setupProperty()
        const user = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        await prismaHttpTest.reportSchedule.createMany({
            data: Array.from({ length: MAX_SCHEDULES_PER_USER }, () => ({
                userId: user.id,
                targetType: "PROPERTY" as const,
                targetId: propertyId,
                type: "CONSUMPTION" as const,
                format: "PDF" as const,
                frequency: "MONTHLY" as const,
                sendDay: 1,
                recipients: ["a@example.com"],
            })),
        })

        const response = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        expect(response.status).toBe(422)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(MAX_SCHEDULES_PER_USER)
    })
})

describe("GET /api/report-schedules", () => {
    it("retorna 401 sem token", async () => {
        expect((await request(app).get("/api/report-schedules")).status).toBe(401)
    })

    it("lista só as configurações do usuário, mais antigas primeiro, com a próxima execução", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const { token: tokenB, propertyId: propertyB } = await setupProperty(anotherUser)
        const first = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId, { frequency: "DAILY", sendDay: null }))
        const second = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))
        await request(app).post("/api/report-schedules").set(authed(tokenB)).send(body(propertyB))

        const response = await request(app).get("/api/report-schedules").set(authed(token))

        expect(response.status).toBe(200)
        expect(response.body.data.total).toBe(2)
        expect(response.body.data.items.map((r: { id: string }) => r.id)).toEqual([
            first.body.data.id,
            second.body.data.id,
        ])
        expect(response.body.data.items[0].nextRunAt).toEqual(expect.any(String))
    })

    it("pagina e retorna 422 para paginação inválida", async () => {
        const { token, propertyId } = await setupProperty()
        for (let i = 0; i < 3; i++) {
            await request(app)
                .post("/api/report-schedules")
                .set(authed(token))
                .send(body(propertyId))
        }

        const paged = await request(app)
            .get("/api/report-schedules?page=2&pageSize=2")
            .set(authed(token))
        const invalid = await request(app)
            .get("/api/report-schedules?pageSize=1000")
            .set(authed(token))

        expect(paged.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 })
        expect(paged.body.data.items).toHaveLength(1)
        expect(invalid.status).toBe(422)
    })
})

describe("PUT /api/report-schedules/:id", () => {
    it("substitui a configuração e recalcula a próxima execução", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        const response = await request(app)
            .put(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(token))
            .send(
                body(propertyId, {
                    frequency: "WEEKLY",
                    sendDay: 3,
                    format: "CSV",
                    active: false,
                    recipients: ["outro@example.com"],
                }),
            )

        expect(response.status).toBe(200)
        expect(response.body.data).toMatchObject({
            id: created.body.data.id,
            frequency: "WEEKLY",
            sendDay: 3,
            format: "CSV",
            active: false,
            recipients: ["outro@example.com"],
            nextRunAt: null,
        })
    })

    it("retorna 404 e não altera configuração de outro usuário", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))
        const { token: tokenB, propertyId: propertyB } = await setupProperty(anotherUser)

        const response = await request(app)
            .put(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(tokenB))
            .send(body(propertyB, { recipients: ["invasor@example.com"] }))

        expect(response.status).toBe(404)
        const stored = await prismaHttpTest.reportSchedule.findFirstOrThrow()
        expect(stored.recipients).toEqual(["financeiro@example.com"])
    })

    it("não deixa apontar a configuração para alvo de outro usuário", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const { propertyId: propertyB } = await setupProperty(anotherUser)
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        const response = await request(app)
            .put(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(token))
            .send(body(propertyB))

        expect(response.status).toBe(403)
        const stored = await prismaHttpTest.reportSchedule.findFirstOrThrow()
        expect(stored.targetId).toBe(propertyId)
    })

    it("retorna 404 para id inexistente e 422 para id ou corpo inválido", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        const missing = await request(app)
            .put("/api/report-schedules/00000000-0000-4000-8000-000000000000")
            .set(authed(token))
            .send(body(propertyId))
        const badId = await request(app)
            .put("/api/report-schedules/nao-e-uuid")
            .set(authed(token))
            .send(body(propertyId))
        const badBody = await request(app)
            .put(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(token))
            .send(body(propertyId, { recipients: ["x"] }))
        expect(missing.status).toBe(404)
        expect(badId.status).toBe(422)
        expect(badBody.status).toBe(422)
    })

    it("bloqueia conta de demonstração", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })

        const response = await request(app)
            .put("/api/report-schedules/00000000-0000-4000-8000-000000000000")
            .set(authed(demoToken))
            .send(body("00000000-0000-4000-8000-000000000000"))

        expect(response.status).toBe(403)
    })
})

describe("DELETE /api/report-schedules/:id", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/report-schedules/00000000-0000-4000-8000-000000000000",
        )
        expect(response.status).toBe(401)
    })

    it("exclui a configuração", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))

        const response = await request(app)
            .delete(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(token))

        expect(response.status).toBe(204)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(0)
    })

    it("retorna 404 e não exclui configuração de outro usuário", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/report-schedules")
            .set(authed(token))
            .send(body(propertyId))
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/report-schedules/${created.body.data.id}`)
            .set(authed(tokenB))

        expect(response.status).toBe(404)
        expect(await prismaHttpTest.reportSchedule.count()).toBe(1)
    })

    it("retorna 404 para id inexistente e 422 para id malformado", async () => {
        const { token } = await setupProperty()

        const missing = await request(app)
            .delete("/api/report-schedules/00000000-0000-4000-8000-000000000000")
            .set(authed(token))
        const malformed = await request(app)
            .delete("/api/report-schedules/nao-e-uuid")
            .set(authed(token))

        expect(missing.status).toBe(404)
        expect(malformed.status).toBe(422)
    })
})
