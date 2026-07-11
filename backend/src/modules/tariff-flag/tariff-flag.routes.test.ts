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

async function promoteToAdmin(email: string) {
    await prismaHttpTest.user.update({ where: { email }, data: { role: "ADMIN" } })
}

async function seedConfig() {
    return prismaHttpTest.tariffFlagConfig.create({
        data: {
            id: 1,
            currentFlag: "GREEN",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        },
    })
}

beforeEach(async () => { await cleanHttpDatabase() })
afterAll(async () => { await prismaHttpTest.$disconnect() })

describe("GET /api/tariff-flag", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/tariff-flag")
        expect(response.status).toBe(401)
    })

    it("retorna 200 com a bandeira vigente para qualquer usuário autenticado", async () => {
        await seedConfig()
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/tariff-flag")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.currentFlag).toBe("GREEN")
    })
})

describe("PUT /api/tariff-flag", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).put("/api/tariff-flag").send({ currentFlag: "YELLOW" })
        expect(response.status).toBe(401)
    })

    it("retorna 403 quando o usuário autenticado não é ADMIN", async () => {
        await seedConfig()
        const token = await registerAndLogin()

        const response = await request(app)
            .put("/api/tariff-flag")
            .set("Authorization", `Bearer ${token}`)
            .send({ currentFlag: "YELLOW" })

        expect(response.status).toBe(403)
    })

    it("retorna 200 e atualiza a bandeira quando o usuário é ADMIN", async () => {
        await seedConfig()
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .put("/api/tariff-flag")
            .set("Authorization", `Bearer ${token}`)
            .send({ currentFlag: "RED_P1" })

        expect(response.status).toBe(200)
        expect(response.body.data.currentFlag).toBe("RED_P1")
    })

    it("retorna 422 para valor inválido", async () => {
        await seedConfig()
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .put("/api/tariff-flag")
            .set("Authorization", `Bearer ${token}`)
            .send({ greenPer100Kwh: -1 })

        expect(response.status).toBe(422)
    })
})
