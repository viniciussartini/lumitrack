import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { GoalProgressService } from "@/modules/goal/goal-progress.service.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ValidationError } from "@/shared/errors/AppError.js"

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(
    propertyRepository,
    new DistributorRepository(prismaTest),
)
const userService = new UserService(new UserRepository(prismaTest))

// 15/06/2026 12:00 em São Paulo.
const MID_2026 = new Date("2026-06-15T15:00:00.000Z")

const service = new GoalProgressService(
    new GoalRepository(prismaTest),
    new MeterRepository(prismaTest),
    new ConsumptionRepository(prismaTest),
    () => MID_2026,
)

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

async function createProperty(userId: string, withMeter: boolean): Promise<string> {
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(userId, {
        name: "Casa",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
    })
    if (withMeter) {
        await prismaTest.meter.create({
            data: {
                name: "Medidor",
                targetType: "PROPERTY",
                propertyId: property.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "casa/geral",
            },
        })
    }
    return property.id
}

async function addReading(propertyId: string, minuteStart: string, kwh: number) {
    const meter = await prismaTest.meter.findFirstOrThrow({ where: { propertyId } })
    await prismaTest.meterReading.create({
        data: {
            meterId: meter.id,
            minuteStart: new Date(minuteStart),
            kwhConsumed: kwh,
            avgVoltage: 127,
            avgCurrent: 10,
            avgPowerW: 1000,
            avgPowerFactor: 0.95,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })
}

async function addGoal(userId: string, propertyId: string, year: number, monthlyKwh = 400) {
    await prismaTest.goal.create({
        data: {
            userId,
            propertyId,
            year,
            referenceYear: year - 1,
            monthlyKwh: Array.from({ length: 12 }, () => monthlyKwh),
            alertPercent: 85,
        },
    })
}

let ownerId: string

beforeEach(async () => {
    await cleanDatabase()
    ownerId = await createUser("joao@example.com", "529.982.247-25")
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("GoalProgressService.list", () => {
    it("soma as leituras de cada mês no fuso de São Paulo", async () => {
        const propertyId = await createProperty(ownerId, true)
        await addGoal(ownerId, propertyId, 2026)
        await addReading(propertyId, "2026-01-10T12:00:00.000Z", 100)
        await addReading(propertyId, "2026-01-20T12:00:00.000Z", 50)
        // 01:00 UTC de 1º de fevereiro ainda é janeiro em São Paulo.
        await addReading(propertyId, "2026-02-01T01:00:00.000Z", 25)
        await addReading(propertyId, "2026-02-01T03:00:00.000Z", 70)

        const { items } = await service.list(ownerId, { propertyId })

        expect(items).toHaveLength(1)
        const [progress] = items
        expect(progress?.year).toBe(2026)
        expect(progress?.months[0]?.realizedKwh).toBe(175)
        expect(progress?.months[1]?.realizedKwh).toBe(70)
        expect(progress?.months[2]?.realizedKwh).toBeNull()
        expect(progress?.yearTargetKwh).toBe(4800)
        expect(progress?.situation).toBe("IN_PROGRESS")
    })

    it("devolve o acompanhamento de vários anos numa chamada só, do mais recente ao mais antigo", async () => {
        const propertyId = await createProperty(ownerId, true)
        await addGoal(ownerId, propertyId, 2025)
        await addGoal(ownerId, propertyId, 2026)
        await addGoal(ownerId, propertyId, 2027)
        await addReading(propertyId, "2025-03-10T12:00:00.000Z", 380)
        await addReading(propertyId, "2026-03-10T12:00:00.000Z", 420)

        const { items } = await service.list(ownerId, { propertyId })

        expect(items.map((i) => i.year)).toEqual([2027, 2026, 2025])
        expect(items[2]?.months[2]?.realizedKwh).toBe(380)
        expect(items[2]?.situation).toBe("MET")
        expect(items[1]?.months[2]?.realizedKwh).toBe(420)
        expect(items[0]?.months.every((m) => m.realizedKwh === null)).toBe(true)
    })

    it("cada item carrega o id da meta", async () => {
        const propertyId = await createProperty(ownerId, true)
        await addGoal(ownerId, propertyId, 2026)
        const goal = await prismaTest.goal.findFirstOrThrow({ where: { propertyId } })

        const { items } = await service.list(ownerId, { propertyId })

        expect(items[0]?.goalId).toBe(goal.id)
    })

    it("propriedade sem medidor não é erro: todos os meses ficam sem leitura", async () => {
        const propertyId = await createProperty(ownerId, false)
        await addGoal(ownerId, propertyId, 2026)

        const { items } = await service.list(ownerId, { propertyId })

        expect(items[0]?.months.every((m) => m.realizedKwh === null)).toBe(true)
        expect(items[0]?.realizedKwh).toBeNull()
        expect(items[0]?.deviationPercent).toBeNull()
    })

    it("propriedade alheia devolve lista vazia, sem revelar as metas", async () => {
        const strangerId = await createUser("maria@example.com", "310.037.856-38")
        const strangerProperty = await createProperty(strangerId, true)
        await addGoal(strangerId, strangerProperty, 2026)
        await addReading(strangerProperty, "2026-03-10T12:00:00.000Z", 420)

        const { items } = await service.list(ownerId, { propertyId: strangerProperty })

        expect(items).toEqual([])
    })

    it("propriedade sem metas devolve lista vazia", async () => {
        const propertyId = await createProperty(ownerId, true)

        expect(await service.list(ownerId, { propertyId })).toEqual({ items: [] })
    })

    it("não carrega o userId", async () => {
        const propertyId = await createProperty(ownerId, true)
        await addGoal(ownerId, propertyId, 2026)

        const { items } = await service.list(ownerId, { propertyId })

        expect(items[0]).not.toHaveProperty("userId")
    })

    it("exige um propertyId válido", async () => {
        await expect(service.list(ownerId, { propertyId: "casa" })).rejects.toThrow(ValidationError)
        await expect(service.list(ownerId, {})).rejects.toThrow(ValidationError)
    })
})
