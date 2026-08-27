import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
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

async function promoteToAdmin(email: string) {
    await prismaHttpTest.user.update({ where: { email }, data: { role: "ADMIN" } })
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/audit-logs", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/admin/audit-logs")
        expect(response.status).toBe(401)
    })

    it("retorna 403 quando o usuário autenticado não é ADMIN", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/admin/audit-logs")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(403)
    })

    it("retorna 200 com os audit logs quando o usuário é ADMIN", async () => {
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .get("/api/admin/audit-logs")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("success")
        // USER_CREATE (cadastro) + LOGIN — pelo menos essas duas linhas já
        // existem antes mesmo da consulta ao endpoint.
        expect(response.body.data.total).toBeGreaterThanOrEqual(2)
        expect(Array.isArray(response.body.data.items)).toBe(true)
    })

    it("filtra por ?action=LOGIN", async () => {
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .get("/api/admin/audit-logs?action=LOGIN")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items.length).toBeGreaterThan(0)
        for (const item of response.body.data.items) {
            expect(item.action).toBe("LOGIN")
        }
    })

    it("pagina via ?page e ?pageSize", async () => {
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .get("/api/admin/audit-logs?page=1&pageSize=1")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.page).toBe(1)
        expect(response.body.data.pageSize).toBe(1)
        expect(response.body.data.total).toBeGreaterThanOrEqual(2)
    })

    it("retorna 422 para parâmetros inválidos (action fora do enum)", async () => {
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        const response = await request(app)
            .get("/api/admin/audit-logs?action=NOT_A_REAL_ACTION")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })

    it("registra um audit log ADMIN_AUDIT_LOG_VIEW após a consulta", async () => {
        const token = await registerAndLogin()
        await promoteToAdmin(validUser.email)

        await request(app).get("/api/admin/audit-logs").set("Authorization", `Bearer ${token}`)

        const adminUser = await prismaHttpTest.user.findUniqueOrThrow({
            where: { email: validUser.email },
        })
        // O controller registra este audit log DEPOIS de enviar a resposta
        // (decisão de latência) — a escrita corre em paralelo ao fim do
        // request acima, sem ordem garantida.
        const auditEntry = await waitFor(() =>
            prismaHttpTest.auditLog.findFirst({
                where: { userId: adminUser.id, action: "ADMIN_AUDIT_LOG_VIEW" },
            }),
        )

        expect(auditEntry).not.toBeNull()
        expect(auditEntry?.outcome).toBe("SUCCESS")
    })
})
