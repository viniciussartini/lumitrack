import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const notificationStore = new NotificationStore()
const app = createApp({ prismaClient: prismaHttpTest, notificationStore })

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
    const createRes = await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return { userId: createRes.body.data.id as string, token: loginRes.body.data.token as string }
}

function seedNotification(userId: string) {
    return notificationStore.add(userId, {
        alertId: "alert-1",
        alertName: "Pico de potência",
        meterId: "meter-1",
        targetType: "PROPERTY",
        targetPath: "/propriedades/prop-1",
        message: 'Alerta "Pico de potência" foi disparado. Clique aqui para ver.',
    })
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("GET /api/notifications", () => {
    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/notifications")
        expect(response.status).toBe(401)
    })

    it("deve retornar 200 com lista vazia quando não há notificações", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/notifications")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar as notificações do usuário autenticado", async () => {
        const { userId, token } = await registerAndLogin()
        seedNotification(userId)

        const response = await request(app)
            .get("/api/notifications")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(1)
        expect(response.body.data[0].alertName).toBe("Pico de potência")
    })

    it("não deve retornar notificações de outro usuário", async () => {
        const { userId: userIdA } = await registerAndLogin(validUser)
        seedNotification(userIdA)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get("/api/notifications")
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.body.data).toEqual([])
    })
})

describe("DELETE /api/notifications/:id", () => {
    it("deve remover a notificação e retornar 204", async () => {
        const { userId, token } = await registerAndLogin()
        const notification = seedNotification(userId)

        const response = await request(app)
            .delete(`/api/notifications/${notification.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
        expect(notificationStore.findAllByUser(userId)).toEqual([])
    })

    it("deve retornar 404 para notificação inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .delete("/api/notifications/id-inexistente")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete("/api/notifications/qualquer-id")
        expect(response.status).toBe(401)
    })

    it("não deve remover notificação de outro usuário (retorna 404)", async () => {
        const { userId: userIdA } = await registerAndLogin(validUser)
        const notification = seedNotification(userIdA)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/notifications/${notification.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(404)
        expect(notificationStore.findAllByUser(userIdA)).toHaveLength(1)
    })
})

describe("DELETE /api/notifications", () => {
    it("deve remover todas as notificações do usuário e retornar 204", async () => {
        const { userId, token } = await registerAndLogin()
        seedNotification(userId)
        seedNotification(userId)

        const response = await request(app)
            .delete("/api/notifications")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
        expect(notificationStore.findAllByUser(userId)).toEqual([])
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete("/api/notifications")
        expect(response.status).toBe(401)
    })
})
