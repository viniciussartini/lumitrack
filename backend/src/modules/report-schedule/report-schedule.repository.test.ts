import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { ReportScheduleRepository } from "@/modules/report-schedule/report-schedule.repository.js"

const app = createApp({ prismaClient: prismaHttpTest })
const repository = new ReportScheduleRepository(prismaHttpTest)

async function createUser(email: string, cpf: string): Promise<string> {
    await request(app).post("/api/users").send({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "Teste",
        lastName: "Silva",
        cpf,
    })
    return (await prismaHttpTest.user.findFirstOrThrow({ where: { email } })).id
}

const data = {
    targetType: "PROPERTY" as const,
    targetId: "8f3c1a52-6c1e-4d0a-9d55-3f0f0b1f7a10",
    type: "CONSUMPTION" as const,
    format: "CSV" as const,
    frequency: "MONTHLY" as const,
    sendDay: 5,
    recipients: ["financeiro@example.com"],
    active: true,
    nextRunAt: new Date("2026-04-05T09:00:00.000Z"),
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("ReportScheduleRepository.createIfBelowLimit", () => {
    it("pedidos simultâneos não passam do teto", async () => {
        const userId = await createUser("joao@example.com", "529.982.247-25")

        const results = await Promise.all(
            Array.from({ length: 12 }, () => repository.createIfBelowLimit(userId, data, 5)),
        )

        expect(results.filter((result) => result !== null)).toHaveLength(5)
        expect(await prismaHttpTest.reportSchedule.count({ where: { userId } })).toBe(5)
    })

    it("o teto é por usuário", async () => {
        const first = await createUser("joao@example.com", "529.982.247-25")
        const second = await createUser("maria@example.com", "310.037.856-38")

        await repository.createIfBelowLimit(first, data, 1)

        expect(await repository.createIfBelowLimit(first, data, 1)).toBeNull()
        expect(await repository.createIfBelowLimit(second, data, 1)).not.toBeNull()
    })
})
