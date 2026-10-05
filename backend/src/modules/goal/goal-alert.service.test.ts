import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { GoalUnit } from "@/generated/prisma/client.js"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { GoalAlertService } from "@/modules/goal/goal-alert.service.js"
import { GoalConsumptionReader } from "@/modules/goal/goal-consumption.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { createConsumptionService } from "@/modules/consumption/consumption.routes.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const propertyService = new PropertyService(
    new PropertyRepository(prismaTest),
    new DistributorRepository(prismaTest),
)
const userService = new UserService(new UserRepository(prismaTest))

// 15/06/2026 12:00 em São Paulo.
const JUNE = new Date("2026-06-15T15:00:00.000Z")

const service = new GoalAlertService(
    new GoalRepository(prismaTest),
    new GoalConsumptionReader(
        new MeterRepository(prismaTest),
        new ConsumptionRepository(prismaTest),
        createConsumptionService(prismaTest),
        new MeterDemandRollupRepository(prismaTest),
    ),
    () => JUNE,
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

async function createProperty(userId: string, name: string, withMeter = true): Promise<string> {
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(userId, {
        name,
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

async function addGoal(
    userId: string,
    propertyId: string,
    year = 2026,
    extra: { alertNotifiedMonth?: number; alertNotifiedYear?: boolean; unit?: GoalUnit } = {},
) {
    return prismaTest.goal.create({
        data: {
            userId,
            propertyId,
            year,
            referenceYear: year - 1,
            monthlyTargets: Array.from({ length: 12 }, () => 400),
            alertPercent: 85,
            ...extra,
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

describe("GoalAlertService.list", () => {
    it("devolve uma linha por meta do ano corrente, de todas as propriedades, por nome", async () => {
        const sitio = await createProperty(ownerId, "Sítio")
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, sitio)
        await addGoal(ownerId, casa)

        const { items } = await service.list(ownerId)

        expect(items.map((i) => i.propertyName)).toEqual(["Casa", "Sítio"])
        expect(items[0]).toMatchObject({ year: 2026, alertPercent: 85 })
    })

    it("só traz metas do ano corrente", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2025)
        await addGoal(ownerId, casa, 2027)

        expect((await service.list(ownerId)).items).toEqual([])
    })

    it("mostra o percentual do mês e do ano e se foi atingido", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa)
        await addReading(casa, "2026-06-10T12:00:00.000Z", 350)

        const [item] = (await service.list(ownerId)).items

        expect(item?.monthly.percent).toBeCloseTo(87.5)
        expect(item?.monthly.reached).toBe(true)
        expect(item?.monthly.notified).toBe(false)
        expect(item?.annual.percent).toBeCloseTo((350 / 4800) * 100)
        expect(item?.annual.reached).toBe(false)
    })

    it("marca como avisado o período cuja marca está gravada", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { alertNotifiedMonth: 6, alertNotifiedYear: true })
        await addReading(casa, "2026-06-10T12:00:00.000Z", 350)

        const [item] = (await service.list(ownerId)).items

        expect(item?.monthly.notified).toBe(true)
        expect(item?.annual.notified).toBe(true)
    })

    it("o aviso de um mês anterior não conta como aviso do mês corrente", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { alertNotifiedMonth: 5 })

        const [item] = (await service.list(ownerId)).items

        expect(item?.monthly.notified).toBe(false)
    })

    it("sem leitura, os percentuais são ausência — nunca zero", async () => {
        const casa = await createProperty(ownerId, "Casa", false)
        await addGoal(ownerId, casa)

        const [item] = (await service.list(ownerId)).items

        expect(item?.monthly).toEqual({ percent: null, reached: false, notified: false })
        expect(item?.annual).toEqual({ percent: null, reached: false, notified: false })
    })

    it("não mostra as metas de outro usuário", async () => {
        const otherId = await createUser("maria@example.com", "310.037.856-38")
        const theirs = await createProperty(otherId, "Sítio")
        await addGoal(otherId, theirs)

        expect((await service.list(ownerId)).items).toEqual([])
    })

    it("não carrega userId nem as marcas internas", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa)

        const [item] = (await service.list(ownerId)).items

        expect(item).not.toHaveProperty("userId")
        expect(item).not.toHaveProperty("alertNotifiedMonth")
        expect(item).not.toHaveProperty("alertNotifiedYear")
    })
})
// Custo mensal simulado (R$): junho de 2026 custou R$ 350, contra a meta de R$ 400.
const costSource = {
    list: vi.fn().mockResolvedValue({
        items: [
            {
                bucketStart: new Date(Date.UTC(2026, 5, 1)),
                kwhConsumed: 100,
                costBrl: 350,
                avgPowerW: 500,
            },
        ],
        total: 1,
        page: 1,
        pageSize: 12,
        granularity: "month",
    }),
} as unknown as Pick<ConsumptionService, "list">

describe("GoalAlertService.list — unidade", () => {
    const costService = () =>
        new GoalAlertService(
            new GoalRepository(prismaTest),
            new GoalConsumptionReader(
                new MeterRepository(prismaTest),
                new ConsumptionRepository(prismaTest),
                costSource,
                new MeterDemandRollupRepository(prismaTest),
            ),
            () => JUNE,
        )

    it("cada meta traz a própria unidade, e a em reais usa o custo", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { unit: "KWH" })
        await addGoal(ownerId, casa, 2026, { unit: "BRL" })
        await addReading(casa, "2026-06-10T12:00:00.000Z", 100)

        const { items } = await costService().list(ownerId)

        const kwh = items.find((i) => i.unit === "KWH")
        const brl = items.find((i) => i.unit === "BRL")
        expect(items).toHaveLength(2)
        expect(kwh?.monthly.percent).toBeCloseTo(25)
        expect(brl?.monthly.percent).toBeCloseTo(87.5)
        expect(brl?.monthly.reached).toBe(true)
    })

    it("o aviso de uma unidade não conta como aviso da outra", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { unit: "KWH", alertNotifiedMonth: 6 })
        await addGoal(ownerId, casa, 2026, { unit: "BRL" })

        const { items } = await costService().list(ownerId)

        expect(items.find((i) => i.unit === "KWH")?.monthly.notified).toBe(true)
        expect(items.find((i) => i.unit === "BRL")?.monthly.notified).toBe(false)
    })
})

async function addRollup(
    propertyId: string,
    month: number,
    post: "PEAK" | "OFF_PEAK",
    maxAvgPowerW: number,
) {
    const meter = await prismaTest.meter.findFirstOrThrow({ where: { propertyId } })
    await prismaTest.meterDemandRollup.create({
        data: {
            meterId: meter.id,
            // Meia-noite de São Paulo do dia 1º, em UTC.
            periodStart: new Date(Date.UTC(2026, month, 1, 3)),
            post,
            maxAvgPowerW,
            windowEndAt: new Date(Date.UTC(2026, month, 10, 15)),
        },
    })
}

describe("GoalAlertService.list — demanda (kW)", () => {
    it("o mês compara o pico do mês com o teto, e o ano não se aplica", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { unit: "KW" })
        await addRollup(casa, 5, "PEAK", 350_000)

        const [item] = (await service.list(ownerId)).items

        expect(item?.unit).toBe("KW")
        expect(item?.monthly.percent).toBeCloseTo(87.5)
        expect(item?.monthly.reached).toBe(true)
        expect(item?.annual).toEqual({ percent: null, reached: false, notified: false })
    })

    it("mês sem janela medida não tem percentual", async () => {
        const casa = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, casa, 2026, { unit: "KW" })

        const [item] = (await service.list(ownerId)).items

        expect(item?.monthly).toEqual({ percent: null, reached: false, notified: false })
    })
})
