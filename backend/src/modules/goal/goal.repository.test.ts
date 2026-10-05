import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const repository = new GoalRepository(prismaTest)
const propertyService = new PropertyService(
    new PropertyRepository(prismaTest),
    new DistributorRepository(prismaTest),
)
const userService = new UserService(new UserRepository(prismaTest))

let userId: string
let propertyId: string

const goalData = (year: number) => ({
    propertyId,
    year,
    referenceYear: year - 1,
    monthlyKwh: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
})

beforeEach(async () => {
    await cleanDatabase()
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
    })
    userId = user.id
    const distributor = await createTestDistributor(prismaTest)
    propertyId = (
        await propertyService.create(userId, {
            name: "Casa",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
        })
    ).id
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("GoalRepository.claimMonthAlert", () => {
    it("só uma de várias reivindicações simultâneas do mesmo mês vence", async () => {
        const goal = await repository.create(userId, goalData(2026))

        const results = await Promise.all(
            Array.from({ length: 10 }, () => repository.claimMonthAlert(goal!.id, 6)),
        )

        expect(results.filter(Boolean)).toHaveLength(1)
    })

    it("o mesmo mês não é reivindicado duas vezes, mas outro mês é", async () => {
        const goal = await repository.create(userId, goalData(2026))

        expect(await repository.claimMonthAlert(goal!.id, 6)).toBe(true)
        expect(await repository.claimMonthAlert(goal!.id, 6)).toBe(false)
        expect(await repository.claimMonthAlert(goal!.id, 7)).toBe(true)
        const stored = await prismaTest.goal.findUniqueOrThrow({ where: { id: goal!.id } })
        expect(stored.alertNotifiedMonth).toBe(7)
    })

    it("meta inexistente não é reivindicada", async () => {
        expect(await repository.claimMonthAlert("00000000-0000-4000-8000-000000000000", 6)).toBe(
            false,
        )
    })
})

describe("GoalRepository.claimYearAlert", () => {
    it("só uma de várias reivindicações simultâneas vence, e depois nenhuma", async () => {
        const goal = await repository.create(userId, goalData(2026))

        const results = await Promise.all(
            Array.from({ length: 10 }, () => repository.claimYearAlert(goal!.id)),
        )

        expect(results.filter(Boolean)).toHaveLength(1)
        expect(await repository.claimYearAlert(goal!.id)).toBe(false)
    })
})

describe("GoalRepository.findPendingAlertGoals", () => {
    it("traz as metas do ano com algum aviso por dar, com o nome da propriedade", async () => {
        await repository.create(userId, goalData(2026))
        await repository.create(userId, goalData(2027))

        const pending = await repository.findPendingAlertGoals(2026, 6)

        expect(pending).toHaveLength(1)
        expect(pending[0]).toMatchObject({ year: 2026, property: { name: "Casa" } })
    })

    it("a meta com os dois avisos do período dados deixa de aparecer", async () => {
        const goal = await repository.create(userId, goalData(2026))
        await repository.claimMonthAlert(goal!.id, 6)
        await repository.claimYearAlert(goal!.id)

        expect(await repository.findPendingAlertGoals(2026, 6)).toHaveLength(0)
    })

    it("no mês seguinte a meta volta a ter aviso do mês por dar", async () => {
        const goal = await repository.create(userId, goalData(2026))
        await repository.claimMonthAlert(goal!.id, 6)
        await repository.claimYearAlert(goal!.id)

        expect(await repository.findPendingAlertGoals(2026, 7)).toHaveLength(1)
    })
})

describe("GoalRepository.update", () => {
    it("editar a meta zera as marcas de aviso", async () => {
        const goal = await repository.create(userId, goalData(2026))
        await repository.claimMonthAlert(goal!.id, 6)
        await repository.claimYearAlert(goal!.id)

        await repository.update(goal!.id, userId, {
            referenceYear: 2025,
            monthlyKwh: Array.from({ length: 12 }, () => 500),
            alertPercent: 90,
        })

        const stored = await prismaTest.goal.findUniqueOrThrow({ where: { id: goal!.id } })
        expect(stored.alertNotifiedMonth).toBeNull()
        expect(stored.alertNotifiedYear).toBe(false)
        expect(stored.alertPercent).toBe(90)
    })
})
