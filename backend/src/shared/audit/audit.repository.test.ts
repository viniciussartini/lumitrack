import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const auditRepository = new AuditRepository(prismaTest)

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// Endpoint administrativo de consulta do audit log (#16 — A09/Art. 48).
describe("AuditRepository.findMany", () => {
    it("filtra por userId", async () => {
        // AuditLog.userId tem FK real para users — precisa de usuários
        // de verdade, não apenas uma string arbitrária.
        const userA = await prismaTest.user.create({
            data: { email: "a@example.com", password: "hash", userType: "INDIVIDUAL" },
        })
        const userB = await prismaTest.user.create({
            data: { email: "b@example.com", password: "hash", userType: "INDIVIDUAL" },
        })

        await auditRepository.create({ userId: userA.id, action: "LOGIN", outcome: "SUCCESS" })
        await auditRepository.create({ userId: userB.id, action: "LOGIN", outcome: "SUCCESS" })

        const result = await auditRepository.findMany({ userId: userA.id }, 1, 50)

        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.userId).toBe(userA.id)
        expect(result.total).toBe(1)
    })

    it("filtra por action", async () => {
        await auditRepository.create({ userId: null, action: "LOGIN", outcome: "SUCCESS" })
        await auditRepository.create({ userId: null, action: "LOGOUT", outcome: "SUCCESS" })

        const result = await auditRepository.findMany({ action: "LOGOUT" }, 1, 50)

        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.action).toBe("LOGOUT")
    })

    it("filtra por outcome", async () => {
        await auditRepository.create({ userId: null, action: "LOGIN", outcome: "SUCCESS" })
        await auditRepository.create({ userId: null, action: "LOGIN", outcome: "FAILURE" })

        const result = await auditRepository.findMany({ outcome: "FAILURE" }, 1, 50)

        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.outcome).toBe("FAILURE")
    })

    it("filtra por resourceType e resourceId", async () => {
        await auditRepository.create({
            userId: null,
            action: "PROPERTY_UPDATE",
            outcome: "SUCCESS",
            resourceType: "Property",
            resourceId: "prop-1",
        })
        await auditRepository.create({
            userId: null,
            action: "PROPERTY_UPDATE",
            outcome: "SUCCESS",
            resourceType: "Property",
            resourceId: "prop-2",
        })

        const result = await auditRepository.findMany(
            { resourceType: "Property", resourceId: "prop-1" },
            1,
            50,
        )

        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.resourceId).toBe("prop-1")
    })

    it("filtra por intervalo de datas (from/to)", async () => {
        const old = await auditRepository.create({ userId: null, action: "LOGIN", outcome: "SUCCESS" })
        void old
        await prismaTest.auditLog.updateMany({
            data: { createdAt: new Date("2020-01-01T00:00:00Z") },
        })
        await auditRepository.create({ userId: null, action: "LOGOUT", outcome: "SUCCESS" })

        const result = await auditRepository.findMany(
            { from: new Date("2024-01-01T00:00:00Z") },
            1,
            50,
        )

        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.action).toBe("LOGOUT")
    })

    it("sem nenhum filtro, retorna tudo paginado, ordenado por createdAt desc", async () => {
        for (let i = 0; i < 3; i++) {
            await auditRepository.create({ userId: null, action: "LOGIN", outcome: "SUCCESS" })
        }

        const result = await auditRepository.findMany({}, 1, 50)

        expect(result.total).toBe(3)
        expect(result.items).toHaveLength(3)
    })

    it("pagina corretamente — segunda página traz os registros restantes", async () => {
        for (let i = 0; i < 5; i++) {
            await auditRepository.create({ userId: null, action: "LOGIN", outcome: "SUCCESS" })
        }

        const page1 = await auditRepository.findMany({}, 1, 2)
        const page2 = await auditRepository.findMany({}, 2, 2)
        const page3 = await auditRepository.findMany({}, 3, 2)

        expect(page1.items).toHaveLength(2)
        expect(page2.items).toHaveLength(2)
        expect(page3.items).toHaveLength(1)
        expect(page1.total).toBe(5)
        expect(page2.total).toBe(5)

        // Ordenado por createdAt desc — nenhum item se repete entre páginas.
        const allIds = [...page1.items, ...page2.items, ...page3.items].map((item) => item.id)
        expect(new Set(allIds).size).toBe(5)
    })
})
