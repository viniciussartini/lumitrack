import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DemandAlertScheduler } from "@/modules/iot/iot-worker/DemandAlertScheduler.js"
import { DemandAlertRepository } from "@/modules/demand-alert/demand-alert.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const demandAlertRepository = new DemandAlertRepository(prismaTest)
const meterRepository = new MeterRepository(prismaTest)
const demandRollupRepository = new MeterDemandRollupRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const PERIOD_START = new Date(Date.UTC(2026, 8, 1, 3, 0)) // início de setembro/2026, local SP
const NOW = new Date(Date.UTC(2026, 8, 8, 19, 5, 30))

function buildScheduler(userEventHub: UserEventHub, notificationStore: NotificationStore) {
    return new DemandAlertScheduler(
        demandAlertRepository,
        meterRepository,
        demandRollupRepository,
        { meterRepository },
        userEventHub,
        notificationStore,
    )
}

async function setupGroupAMeter(contractedDemandKw = 200): Promise<{
    userId: string
    propertyId: string
    meterId: string
}> {
    const user = await userService.createUser({
        email: "industria@example.com",
        password: "Senha@123",
        userType: "COMPANY",
        acceptedTerms: true,
        companyName: "Metalúrgica Ltda",
        cnpj: "11.222.333/0001-81",
    })

    const distributor = await prismaTest.energyDistributor.create({
        data: {
            name: "Celesc Distribuição",
            cnpj: "08.336.783/0001-90",
            state: "SC",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.17,
            pisRate: 0.0165,
            cofinsRate: 0.076,
            peakWindowStartHour: 18,
            peakWindowEndHour: 21,
        },
    })

    const property = await prismaTest.property.create({
        data: {
            userId: user.id,
            distributorId: distributor.id,
            name: "Metalúrgica",
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw,
            billingClass: null,
        },
    })

    const meter = await prismaTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/meter",
        },
    })

    return { userId: user.id, propertyId: property.id, meterId: meter.id }
}

async function createDemandAlert(
    userId: string,
    meterId: string,
    thresholdPercent = 100,
    lastNotifiedPeriodStart: Date | null = null,
) {
    return prismaTest.demandAlert.create({
        data: {
            userId,
            meterId,
            name: "Ultrapassagem de demanda",
            thresholdPercent,
            lastNotifiedPeriodStart,
        },
    })
}

async function createRollup(meterId: string, maxAvgPowerW: number) {
    await demandRollupRepository.upsertIfGreater(meterId, PERIOD_START, "PEAK", maxAvgPowerW, NOW)
}

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("DemandAlertScheduler (integração)", () => {
    it("dispara notificação quando a demanda medida cruza o limiar configurado", async () => {
        const { userId, meterId } = await setupGroupAMeter(200)
        const alert = await createDemandAlert(userId, meterId, 100)
        await createRollup(meterId, 210_000) // 210 kW > 200 kW contratados

        const notificationStore = new NotificationStore()
        const userEventHub = new UserEventHub()
        const scheduler = buildScheduler(userEventHub, notificationStore)

        await scheduler.tick(NOW)

        const notifications = notificationStore.findAllByUser(userId)
        expect(notifications).toHaveLength(1)
        expect(notifications[0]!.alertId).toBe(alert.id)
        expect(notifications[0]!.message).toContain("105.0%")

        const updated = await demandAlertRepository.findById(alert.id)
        expect(updated!.lastNotifiedPeriodStart).toEqual(PERIOD_START)
    })

    it("não dispara quando a demanda medida fica dentro da contratada", async () => {
        const { userId, meterId } = await setupGroupAMeter(200)
        await createDemandAlert(userId, meterId, 105)
        await createRollup(meterId, 190_000) // 95% da contratada

        const notificationStore = new NotificationStore()
        const scheduler = buildScheduler(new UserEventHub(), notificationStore)

        await scheduler.tick(NOW)

        expect(notificationStore.findAllByUser(userId)).toHaveLength(0)
    })

    it("não duplica notificação para o mesmo ciclo de faturamento", async () => {
        const { userId, meterId } = await setupGroupAMeter(200)
        await createDemandAlert(userId, meterId, 100, PERIOD_START)
        await createRollup(meterId, 300_000)

        const notificationStore = new NotificationStore()
        const scheduler = buildScheduler(new UserEventHub(), notificationStore)

        await scheduler.tick(NOW)

        expect(notificationStore.findAllByUser(userId)).toHaveLength(0)
    })

    it("dispara de novo num novo ciclo de faturamento após já ter notificado o anterior", async () => {
        const { userId, meterId } = await setupGroupAMeter(200)
        const previousPeriodStart = new Date(Date.UTC(2026, 7, 1, 3, 0)) // agosto/2026
        await createDemandAlert(userId, meterId, 100, previousPeriodStart)
        await createRollup(meterId, 300_000)

        const notificationStore = new NotificationStore()
        const scheduler = buildScheduler(new UserEventHub(), notificationStore)

        await scheduler.tick(NOW)

        expect(notificationStore.findAllByUser(userId)).toHaveLength(1)
    })

    it("não dispara para um alerta desabilitado", async () => {
        const { userId, meterId } = await setupGroupAMeter(200)
        await prismaTest.demandAlert.create({
            data: {
                userId,
                meterId,
                name: "Desabilitado",
                thresholdPercent: 100,
                enabled: false,
            },
        })
        await createRollup(meterId, 300_000)

        const notificationStore = new NotificationStore()
        const scheduler = buildScheduler(new UserEventHub(), notificationStore)

        await scheduler.tick(NOW)

        expect(notificationStore.findAllByUser(userId)).toHaveLength(0)
    })
})
