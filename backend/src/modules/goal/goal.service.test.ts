import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { GoalService } from "@/modules/goal/goal.service.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(
    propertyRepository,
    new DistributorRepository(prismaTest),
)
const userService = new UserService(new UserRepository(prismaTest))

// 2026-06-15, meio do ano em São Paulo.
const MID_2026 = new Date("2026-06-15T15:00:00.000Z")

function buildService(now: Date = MID_2026) {
    return new GoalService(new GoalRepository(prismaTest), propertyRepository, () => now)
}

async function createUser(email: string, cpf: string): Promise<string> {
    const user = await userService.createUser({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "Teste",
        lastName: "Silva",
        cpf,
    })
    return user.id
}

async function createProperty(userId: string, name = "Casa"): Promise<string> {
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(userId, {
        name,
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
    })
    return property.id
}

const months = (kwh = 400) => Array.from({ length: 12 }, () => kwh)

const body = (propertyId: string, override: Record<string, unknown> = {}) => ({
    propertyId,
    year: 2026,
    referenceYear: 2025,
    monthlyKwh: months(),
    alertPercent: 85,
    ...override,
})

let ownerId: string
let propertyId: string

beforeEach(async () => {
    await cleanDatabase()
    ownerId = await createUser("joao@example.com", "529.982.247-25")
    propertyId = await createProperty(ownerId)
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("GoalService.create", () => {
    it("cria a meta do ano corrente sem expor o dono", async () => {
        const goal = await buildService().create(ownerId, body(propertyId))

        expect(goal).toMatchObject({
            propertyId,
            year: 2026,
            referenceYear: 2025,
            alertPercent: 85,
        })
        expect(goal.monthlyKwh).toEqual(months())
        expect(goal).not.toHaveProperty("userId")
    })

    it("aceita meta de ano futuro", async () => {
        const goal = await buildService().create(
            ownerId,
            body(propertyId, { year: 2027, referenceYear: 2026 }),
        )
        expect(goal.year).toBe(2027)
    })

    it("rejeita meta de ano passado", async () => {
        await expect(
            buildService().create(ownerId, body(propertyId, { year: 2025, referenceYear: 2024 })),
        ).rejects.toThrow(ValidationError)
    })

    it("conta o ano em horário de São Paulo: 1º de janeiro às 01:00 UTC ainda é o ano anterior", async () => {
        const stillLastYear = new Date("2027-01-01T01:00:00.000Z")

        await expect(
            buildService(stillLastYear).create(
                ownerId,
                body(propertyId, { year: 2026, referenceYear: 2025 }),
            ),
        ).resolves.toMatchObject({ year: 2026 })
    })

    it("rejeita uma segunda meta para o mesmo ano da propriedade", async () => {
        const service = buildService()
        await service.create(ownerId, body(propertyId))

        await expect(service.create(ownerId, body(propertyId))).rejects.toThrow(ConflictError)
    })

    it("permite o mesmo ano em outra propriedade", async () => {
        const service = buildService()
        const other = await createProperty(ownerId, "Sítio")
        await service.create(ownerId, body(propertyId))

        await expect(service.create(ownerId, body(other))).resolves.toMatchObject({
            propertyId: other,
        })
    })

    it("propriedade de outro usuário é indistinguível de inexistente", async () => {
        const strangerId = await createUser("maria@example.com", "310.037.856-38")
        const strangerProperty = await createProperty(strangerId, "Alheia")

        await expect(buildService().create(ownerId, body(strangerProperty))).rejects.toThrow(
            NotFoundError,
        )
        await expect(
            buildService().create(ownerId, body("3f2b8c1e-9d4a-4c6e-8f21-0a1b2c3d4e5f")),
        ).rejects.toThrow(NotFoundError)
        expect(await prismaTest.goal.count()).toBe(0)
    })

    it("valida o corpo antes de tocar no banco", async () => {
        await expect(
            buildService().create(ownerId, body(propertyId, { monthlyKwh: [1, 2, 3] })),
        ).rejects.toThrow(ValidationError)
    })
})

describe("GoalService.list", () => {
    it("lista do ano mais recente para o mais antigo, só da propriedade pedida", async () => {
        const service = buildService()
        const other = await createProperty(ownerId, "Sítio")
        await service.create(ownerId, body(propertyId, { year: 2026, referenceYear: 2025 }))
        await service.create(ownerId, body(propertyId, { year: 2028, referenceYear: 2026 }))
        await service.create(ownerId, body(propertyId, { year: 2027, referenceYear: 2026 }))
        await service.create(ownerId, body(other))

        const page = await service.list(ownerId, { propertyId })

        expect(page.items.map((g) => g.year)).toEqual([2028, 2027, 2026])
        expect(page.total).toBe(3)
        expect(page.items[0]).not.toHaveProperty("userId")
    })

    it("propriedade alheia devolve lista vazia, sem revelar as metas", async () => {
        const strangerId = await createUser("maria@example.com", "310.037.856-38")
        const strangerProperty = await createProperty(strangerId, "Alheia")
        await buildService().create(strangerId, body(strangerProperty))

        const page = await buildService().list(ownerId, { propertyId: strangerProperty })

        expect(page.items).toEqual([])
        expect(page.total).toBe(0)
    })
})

describe("GoalService.update", () => {
    const editable = (override: Record<string, unknown> = {}) => ({
        referenceYear: 2024,
        monthlyKwh: months(500),
        alertPercent: 90,
        ...override,
    })

    it("edita a meta do ano corrente sem mudar ano nem propriedade", async () => {
        const service = buildService()
        const created = await service.create(ownerId, body(propertyId))

        const updated = await service.update(ownerId, { id: created.id }, editable())

        expect(updated).toMatchObject({
            id: created.id,
            year: 2026,
            propertyId,
            referenceYear: 2024,
            alertPercent: 90,
        })
        expect(updated.monthlyKwh).toEqual(months(500))
    })

    it("edita meta de ano futuro", async () => {
        const service = buildService()
        const created = await service.create(
            ownerId,
            body(propertyId, { year: 2027, referenceYear: 2026 }),
        )

        await expect(
            service.update(ownerId, { id: created.id }, editable({ referenceYear: 2025 })),
        ).resolves.toMatchObject({ referenceYear: 2025 })
    })

    it("meta de ano passado é imutável", async () => {
        const created = await buildService(new Date("2026-06-15T15:00:00.000Z")).create(
            ownerId,
            body(propertyId),
        )
        const nextYear = buildService(new Date("2027-01-01T03:00:00.000Z"))

        await expect(nextYear.update(ownerId, { id: created.id }, editable())).rejects.toThrow(
            ConflictError,
        )
        const stored = await prismaTest.goal.findUniqueOrThrow({ where: { id: created.id } })
        expect(stored.alertPercent).toBe(85)
    })

    it("a virada do ano é em São Paulo: ainda dá para editar às 02:59 UTC de 1º de janeiro", async () => {
        const service = buildService()
        const created = await service.create(ownerId, body(propertyId))
        const lastMinutesOfYear = buildService(new Date("2027-01-01T02:59:00.000Z"))

        await expect(
            lastMinutesOfYear.update(ownerId, { id: created.id }, editable()),
        ).resolves.toMatchObject({ alertPercent: 90 })
    })

    it("o ano de referência continua anterior ao ano da meta", async () => {
        const service = buildService()
        const created = await service.create(ownerId, body(propertyId))

        await expect(
            service.update(ownerId, { id: created.id }, editable({ referenceYear: 2026 })),
        ).rejects.toThrow(ValidationError)
    })

    it("meta de outro usuário é indistinguível de inexistente", async () => {
        const strangerId = await createUser("maria@example.com", "310.037.856-38")
        const strangerProperty = await createProperty(strangerId, "Alheia")
        const strangerGoal = await buildService().create(strangerId, body(strangerProperty))

        await expect(
            buildService().update(ownerId, { id: strangerGoal.id }, editable()),
        ).rejects.toThrow(NotFoundError)
        const stored = await prismaTest.goal.findUniqueOrThrow({ where: { id: strangerGoal.id } })
        expect(stored.alertPercent).toBe(85)
    })
})

describe("GoalService.remove", () => {
    it("exclui a meta do ano corrente e a de ano futuro", async () => {
        const service = buildService()
        const current = await service.create(ownerId, body(propertyId))
        const future = await service.create(
            ownerId,
            body(propertyId, { year: 2027, referenceYear: 2026 }),
        )

        await service.remove(ownerId, { id: current.id })
        await service.remove(ownerId, { id: future.id })

        expect(await prismaTest.goal.count()).toBe(0)
    })

    it("meta de ano passado não pode ser excluída", async () => {
        const created = await buildService().create(ownerId, body(propertyId))
        const nextYear = buildService(new Date("2027-01-01T03:00:00.000Z"))

        await expect(nextYear.remove(ownerId, { id: created.id })).rejects.toThrow(ConflictError)
        expect(await prismaTest.goal.count()).toBe(1)
    })

    it("meta de outro usuário é indistinguível de inexistente", async () => {
        const strangerId = await createUser("maria@example.com", "310.037.856-38")
        const strangerProperty = await createProperty(strangerId, "Alheia")
        const strangerGoal = await buildService().create(strangerId, body(strangerProperty))

        await expect(buildService().remove(ownerId, { id: strangerGoal.id })).rejects.toThrow(
            NotFoundError,
        )
        expect(await prismaTest.goal.count()).toBe(1)
    })
})
