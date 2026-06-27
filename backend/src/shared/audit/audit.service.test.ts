import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { AuditService } from "@/shared/audit/audit.service.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const auditRepository = new AuditRepository(prismaTest)
const auditService = new AuditService(auditRepository)

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("AuditService.record", () => {
    it("persiste o evento no banco", async () => {
        await auditService.record({
            userId: null,
            action: "LOGIN",
            outcome: "FAILURE",
            resourceType: "User",
            metadata: { attemptedEmail: "x@x.com" },
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
        })

        const rows = await prismaTest.auditLog.findMany()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            action: "LOGIN",
            outcome: "FAILURE",
            resourceType: "User",
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
        })
        expect(rows[0]?.metadata).toEqual({ attemptedEmail: "x@x.com" })
    })

    it("não lança quando a persistência falha (degrada para o logger)", async () => {
        const brokenRepository = {
            create: vi.fn().mockRejectedValue(new Error("conexão perdida")),
        } as unknown as AuditRepository
        const service = new AuditService(brokenRepository)

        await expect(
            service.record({ userId: null, action: "LOGOUT", outcome: "SUCCESS" }),
        ).resolves.toBeUndefined()
    })
})
