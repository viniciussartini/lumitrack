import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { GoalUnit } from "@/generated/prisma/client.js"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { ValidationError } from "@/shared/errors/AppError.js"
import { GoalAlertScheduler } from "@/modules/goal/GoalAlertScheduler.js"
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
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

// Captura o log do avaliador: o logger real fica em nível "silent" nos testes.
const logMock = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}))

vi.mock("@/shared/logger/logger.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/shared/logger/logger.js")>()
    const patched = Object.create(actual.logger) as typeof actual.logger
    patched.child = (() => logMock) as unknown as typeof actual.logger.child
    return { ...actual, logger: patched }
})

const propertyService = new PropertyService(
    new PropertyRepository(prismaTest),
    new DistributorRepository(prismaTest),
)
const userService = new UserService(new UserRepository(prismaTest))
const goalRepository = new GoalRepository(prismaTest)
const realReader = new GoalConsumptionReader(
    new MeterRepository(prismaTest),
    new ConsumptionRepository(prismaTest),
    createConsumptionService(prismaTest),
    new MeterDemandRollupRepository(prismaTest),
)

// 15/06/2026 12:00 em São Paulo.
const JUNE = new Date("2026-06-15T15:00:00.000Z")
const JULY = new Date("2026-07-15T15:00:00.000Z")

let store: NotificationStore
let hub: UserEventHub
let received: { event: string; payload: unknown }[]

const buildScheduler = (reader: GoalConsumptionReader = realReader) =>
    new GoalAlertScheduler(goalRepository, reader, hub, store)

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
    options: {
        year?: number
        monthlyTargets?: number
        alertPercent?: number
        unit?: GoalUnit
    } = {},
) {
    const year = options.year ?? 2026
    return prismaTest.goal.create({
        data: {
            userId,
            propertyId,
            year,
            unit: options.unit ?? "KWH",
            referenceYear: year - 1,
            monthlyTargets: Array.from({ length: 12 }, () => options.monthlyTargets ?? 400),
            alertPercent: options.alertPercent ?? 85,
        },
    })
}

let ownerId: string

beforeEach(async () => {
    await cleanDatabase()
    store = new NotificationStore()
    hub = new UserEventHub()
    received = []
    vi.clearAllMocks()
    ownerId = await createUser("joao@example.com", "529.982.247-25")
    hub.addListener(ownerId, (event, payload) => received.push({ event, payload }))
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("GoalAlertScheduler — aviso do mês", () => {
    it("avisa ao atingir o percentual da meta do mês, com a notificação sem medidor", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        const goal = await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)

        await buildScheduler().tick(JUNE)

        const [notification] = store.findAllByUser(ownerId)
        expect(store.findAllByUser(ownerId)).toHaveLength(1)
        expect(notification).toMatchObject({
            alertId: goal.id,
            alertName: "Meta 2026 · Casa",
            meterId: null,
            targetType: "PROPERTY",
            targetPath: `/configuracoes/metas?propertyId=${propertyId}`,
        })
        expect(notification?.message).toContain("Casa")
        expect(notification?.message).toContain("87,5%")
        expect(notification?.message).toContain("meta do mês")
        expect(received).toHaveLength(1)
        expect(received[0]?.event).toBe("notification")
        expect(received[0]?.payload).toEqual(notification)
    })

    it("não avisa abaixo do percentual e não grava marca", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        const goal = await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 300)

        await buildScheduler().tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(0)
        const stored = await prismaTest.goal.findUniqueOrThrow({ where: { id: goal.id } })
        expect(stored.alertNotifiedMonth).toBeNull()
        expect(stored.alertNotifiedYear).toBe(false)
    })

    it("não repete o aviso no mesmo mês", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        const scheduler = buildScheduler()

        await scheduler.tick(JUNE)
        await scheduler.tick(new Date("2026-06-20T15:00:00.000Z"))

        expect(store.findAllByUser(ownerId)).toHaveLength(1)
    })

    it("avisa de novo no mês seguinte", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { monthlyTargets: 400 })
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        await addReading(propertyId, "2026-07-10T12:00:00.000Z", 360)
        const scheduler = buildScheduler()

        await scheduler.tick(JUNE)
        await scheduler.tick(JULY)

        expect(store.findAllByUser(ownerId)).toHaveLength(2)
        const stored = await prismaTest.goal.findFirstOrThrow({ where: { propertyId } })
        expect(stored.alertNotifiedMonth).toBe(7)
    })

    it("mês sem leitura nunca avisa", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId)

        await buildScheduler().tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(0)
    })
})

describe("GoalAlertScheduler — aviso do ano", () => {
    it("avisa uma vez ao acumulado do ano atingir o percentual da meta anual", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId)
        // 4.200 de 4.800 = 87,5% do ano, com junho (700) acima da meta do mês.
        for (const month of ["01", "02", "03", "04", "05", "06"]) {
            await addReading(propertyId, `2026-${month}-10T12:00:00.000Z`, 700)
        }

        await buildScheduler().tick(JUNE)

        const messages = store.findAllByUser(ownerId).map((n) => n.message)
        expect(messages).toHaveLength(2)
        expect(messages.some((m) => m.includes("meta do mês"))).toBe(true)
        expect(messages.some((m) => m.includes("acumulado do ano") && m.includes("87,5%"))).toBe(
            true,
        )
        const stored = await prismaTest.goal.findFirstOrThrow({ where: { propertyId } })
        expect(stored.alertNotifiedYear).toBe(true)
        expect(stored.alertNotifiedMonth).toBe(6)
    })

    it("o aviso do ano não se repete nos meses seguintes, mas o do mês sim", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId)
        for (const month of ["01", "02", "03", "04", "05", "06", "07"]) {
            await addReading(propertyId, `2026-${month}-10T12:00:00.000Z`, 700)
        }
        const scheduler = buildScheduler()

        await scheduler.tick(JUNE)
        await scheduler.tick(JULY)

        const messages = store.findAllByUser(ownerId).map((n) => n.message)
        expect(messages).toHaveLength(3)
        expect(messages.filter((m) => m.includes("acumulado do ano"))).toHaveLength(1)
    })
})

describe("GoalAlertScheduler — quais metas são avaliadas", () => {
    it("ignora meta de outro ano", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { year: 2025 })
        await addGoal(ownerId, propertyId, { year: 2027 })
        await addReading(propertyId, "2025-06-10T12:00:00.000Z", 9999)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 9999)

        await buildScheduler().tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(0)
    })

    it("propriedade sem medidor não é erro e não avisa", async () => {
        const propertyId = await createProperty(ownerId, "Casa", false)
        await addGoal(ownerId, propertyId)

        await expect(buildScheduler().tick(JUNE)).resolves.toBeUndefined()
        expect(store.findAllByUser(ownerId)).toHaveLength(0)
    })

    it("avisa cada dono só das próprias metas", async () => {
        const otherId = await createUser("maria@example.com", "310.037.856-38")
        const mine = await createProperty(ownerId, "Casa")
        const theirs = await createProperty(otherId, "Sítio")
        await addGoal(ownerId, mine)
        await addGoal(otherId, theirs)
        await addReading(mine, "2026-06-10T12:00:00.000Z", 350)
        await addReading(theirs, "2026-06-10T12:00:00.000Z", 100)

        await buildScheduler().tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(1)
        expect(store.findAllByUser(otherId)).toHaveLength(0)
    })

    it("o consumo de uma propriedade não vaza para a meta de outra", async () => {
        const first = await createProperty(ownerId, "Casa")
        const second = await createProperty(ownerId, "Sítio")
        await addGoal(ownerId, first)
        await addGoal(ownerId, second)
        await addReading(first, "2026-06-10T12:00:00.000Z", 350)
        await addReading(second, "2026-06-10T12:00:00.000Z", 50)

        await buildScheduler().tick(JUNE)

        const notifications = store.findAllByUser(ownerId)
        expect(notifications).toHaveLength(1)
        expect(notifications[0]?.alertName).toBe("Meta 2026 · Casa")
    })
})

describe("GoalAlertScheduler — robustez", () => {
    it("falha de uma propriedade não impede as demais", async () => {
        const broken = await createProperty(ownerId, "Quebrada")
        const healthy = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, broken)
        await addGoal(ownerId, healthy)
        await addReading(healthy, "2026-06-10T12:00:00.000Z", 350)
        const reader = {
            monthlyValues: vi.fn(
                (
                    userId: string,
                    propertyId: string,
                    firstYear: number,
                    unit: GoalUnit,
                    now: Date,
                ) =>
                    propertyId === broken
                        ? Promise.reject(new Error("falha de banco"))
                        : realReader.monthlyValues(userId, propertyId, firstYear, unit, now),
            ),
        } as unknown as GoalConsumptionReader

        await expect(buildScheduler(reader).tick(JUNE)).resolves.toBeUndefined()

        const notifications = store.findAllByUser(ownerId)
        expect(notifications).toHaveLength(1)
        expect(notifications[0]?.alertName).toBe("Meta 2026 · Casa")
    })

    it("avalia um grupo de cada vez, para não disputar o pool de conexões com as requisições", async () => {
        const first = await createProperty(ownerId, "Casa 1")
        const second = await createProperty(ownerId, "Casa 2")
        const third = await createProperty(ownerId, "Casa 3")
        for (const propertyId of [first, second, third]) await addGoal(ownerId, propertyId)
        let inFlight = 0
        let maxInFlight = 0
        const reader = {
            monthlyValues: vi.fn(async () => {
                inFlight++
                maxInFlight = Math.max(maxInFlight, inFlight)
                await new Promise((resolve) => setTimeout(resolve, 10))
                inFlight--
                return realReader.monthlyValues(ownerId, first, 2026, "KWH", JUNE)
            }),
        } as unknown as GoalConsumptionReader

        await buildScheduler(reader).tick(JUNE)

        expect(reader.monthlyValues).toHaveBeenCalledTimes(3)
        expect(maxInFlight).toBe(1)
    })

    it("tick nunca rejeita, mesmo com o banco falhando", async () => {
        const failingRepository = {
            findPendingAlertGoals: vi.fn().mockRejectedValue(new Error("banco fora")),
        } as unknown as GoalRepository
        const scheduler = new GoalAlertScheduler(failingRepository, realReader, hub, store)

        await expect(scheduler.tick(JUNE)).resolves.toBeUndefined()
    })

    it("duas instâncias avaliando ao mesmo tempo avisam uma só vez", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)

        await Promise.all([
            buildScheduler().tick(JUNE),
            buildScheduler().tick(JUNE),
            buildScheduler().tick(JUNE),
        ])

        expect(store.findAllByUser(ownerId)).toHaveLength(1)
    })

    it("editar a meta zera as marcas e o aviso pode sair de novo", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        const goal = await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        const scheduler = buildScheduler()
        await scheduler.tick(JUNE)
        expect(store.findAllByUser(ownerId)).toHaveLength(1)

        await goalRepository.update(goal.id, ownerId, {
            referenceYear: 2025,
            monthlyTargets: Array.from({ length: 12 }, () => 400),
            alertPercent: 80,
        })
        await scheduler.tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(2)
    })

    it("só ids e códigos vão para o log, nunca o nome da propriedade", async () => {
        const propertyId = await createProperty(ownerId, "Casa da Maria Silva")
        await addGoal(ownerId, propertyId)
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        const reader = {
            monthlyValues: vi.fn().mockRejectedValue(new Error("falha")),
        } as unknown as GoalConsumptionReader

        await buildScheduler(reader).tick(JUNE)

        expect(logMock.error).toHaveBeenCalled()
        const logged = JSON.stringify([logMock.error.mock.calls, logMock.warn.mock.calls])
        expect(logged).not.toContain("Maria Silva")
        expect(logged).toContain(propertyId)
    })
})

describe("GoalAlertScheduler — meta de custo (R$)", () => {
    // Custo de junho de 2026: R$ 350 contra a meta de R$ 400 do mês (87,5%).
    const costList = (costBrl: number) =>
        vi.fn().mockResolvedValue({
            items: [
                {
                    bucketStart: new Date(Date.UTC(2026, 5, 1)),
                    kwhConsumed: 100,
                    costBrl,
                    avgPowerW: 500,
                },
            ],
            total: 1,
            page: 1,
            pageSize: 12,
            granularity: "month",
        })

    const costReader = (costBrl: number) =>
        new GoalConsumptionReader(
            new MeterRepository(prismaTest),
            new ConsumptionRepository(prismaTest),
            { list: costList(costBrl) } as unknown as Pick<ConsumptionService, "list">,
            new MeterDemandRollupRepository(prismaTest),
        )

    it("avisa a meta de custo pelo custo, com a mensagem e o nome de custo", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "BRL" })

        await buildScheduler(costReader(350)).tick(JUNE)

        const [notification] = store.findAllByUser(ownerId)
        expect(store.findAllByUser(ownerId)).toHaveLength(1)
        expect(notification?.alertName).toBe("Meta 2026 · Casa · R$")
        expect(notification?.message).toContain("o custo do mês atingiu 87,5%")
        expect(notification?.message).toContain("meta de custo do mês")
        expect(notification).toMatchObject({
            meterId: null,
            targetPath: `/configuracoes/metas?propertyId=${propertyId}`,
        })
    })

    it("o consumo alto não dispara a meta em reais: ela só olha o custo", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "BRL" })
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 9999)

        await buildScheduler(costReader(100)).tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(0)
    })

    it("as metas de kWh e de reais da mesma propriedade avisam uma vez cada, de forma independente", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KWH" })
        await addGoal(ownerId, propertyId, { unit: "BRL" })
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        const scheduler = buildScheduler(costReader(350))

        await scheduler.tick(JUNE)
        await scheduler.tick(JUNE)

        const names = store.findAllByUser(ownerId).map((n) => n.alertName)
        expect(names.sort()).toEqual(["Meta 2026 · Casa", "Meta 2026 · Casa · R$"])
    })

    it("custo não calculável não avisa e não é erro", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "BRL" })
        const unsupported = new GoalConsumptionReader(
            new MeterRepository(prismaTest),
            new ConsumptionRepository(prismaTest),
            {
                list: vi.fn().mockRejectedValue(new ValidationError("Grupo A sem apuração")),
            } as unknown as Pick<ConsumptionService, "list">,
            new MeterDemandRollupRepository(prismaTest),
        )

        await expect(buildScheduler(unsupported).tick(JUNE)).resolves.toBeUndefined()
        expect(store.findAllByUser(ownerId)).toHaveLength(0)
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

describe("GoalAlertScheduler — meta de demanda (kW)", () => {
    it("avisa pelo pico do mês, com a mensagem e o nome de demanda", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KW" })
        await addRollup(propertyId, 5, "PEAK", 350_000)

        await buildScheduler().tick(JUNE)

        const [notification] = store.findAllByUser(ownerId)
        expect(store.findAllByUser(ownerId)).toHaveLength(1)
        expect(notification?.alertName).toBe("Meta 2026 · Casa · kW")
        expect(notification?.message).toContain("a demanda medida do mês atingiu 87,5%")
        expect(notification?.message).toContain("meta de demanda do mês")
        expect(notification).toMatchObject({
            meterId: null,
            targetPath: `/configuracoes/metas?propertyId=${propertyId}`,
        })
    })

    it("não repete no mesmo mês e avisa de novo no seguinte", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KW" })
        await addRollup(propertyId, 5, "PEAK", 350_000)
        await addRollup(propertyId, 6, "PEAK", 360_000)
        const scheduler = buildScheduler()

        await scheduler.tick(JUNE)
        await scheduler.tick(new Date("2026-06-20T15:00:00.000Z"))
        expect(store.findAllByUser(ownerId)).toHaveLength(1)

        await scheduler.tick(JULY)
        expect(store.findAllByUser(ownerId)).toHaveLength(2)
    })

    it("nunca avisa o ano: picos altos o ano todo geram só os avisos mensais", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KW" })
        for (const month of [0, 1, 2, 3, 4, 5]) {
            await addRollup(propertyId, month, "PEAK", 500_000)
        }

        await buildScheduler().tick(JUNE)

        const messages = store.findAllByUser(ownerId).map((n) => n.message)
        expect(messages).toHaveLength(1)
        expect(messages[0]).not.toContain("acumulado")
        const stored = await prismaTest.goal.findFirstOrThrow({ where: { propertyId } })
        expect(stored.alertNotifiedYear).toBe(false)
    })

    it("pico abaixo do percentual ou mês sem janela medida não avisa", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KW" })
        await addRollup(propertyId, 4, "PEAK", 500_000)
        await addRollup(propertyId, 5, "PEAK", 100_000)

        await buildScheduler().tick(JUNE)

        expect(store.findAllByUser(ownerId)).toHaveLength(0)
    })

    it("a meta de demanda e a de consumo da mesma propriedade avisam de forma independente", async () => {
        const propertyId = await createProperty(ownerId, "Casa")
        await addGoal(ownerId, propertyId, { unit: "KWH" })
        await addGoal(ownerId, propertyId, { unit: "KW" })
        await addReading(propertyId, "2026-06-10T12:00:00.000Z", 350)
        await addRollup(propertyId, 5, "PEAK", 350_000)

        await buildScheduler().tick(JUNE)

        expect(
            store
                .findAllByUser(ownerId)
                .map((n) => n.alertName)
                .sort(),
        ).toEqual(["Meta 2026 · Casa", "Meta 2026 · Casa · kW"])
    })
})
