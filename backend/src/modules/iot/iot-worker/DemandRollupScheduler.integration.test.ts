import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DemandRollupScheduler } from "@/modules/iot/iot-worker/DemandRollupScheduler.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const scheduler = new DemandRollupScheduler(
    new MeterReadingRepository(prismaTest),
    new MeterRepository(prismaTest),
    new DistributorRepository(prismaTest),
    new MeterDemandRollupRepository(prismaTest),
)
const demandRollupRepository = new MeterDemandRollupRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const MINUTE_MS = 60 * 1000
const PEAK_WINDOW_START = 18
const PEAK_WINDOW_END = 21

// 2026-09-08 é terça-feira. 22:04 UTC = 19:04 em São Paulo (UTC-3), dentro da
// janela de ponta configurada (18h-21h) — mesma convenção de deslocamento
// (+3h da hora local pretendida) usada em consumption.repository.test.ts.
const TARGET_MINUTE = new Date(Date.UTC(2026, 8, 8, 22, 4, 0))
const NOW = new Date(TARGET_MINUTE.getTime() + MINUTE_MS + 5_000)

async function setupGroupAMeter(): Promise<string> {
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
            peakWindowStartHour: PEAK_WINDOW_START,
            peakWindowEndHour: PEAK_WINDOW_END,
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

    return meter.id
}

async function createReading(meterId: string, minuteStart: Date, avgPowerW: number): Promise<void> {
    await prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart,
            kwhConsumed: 0.01,
            avgVoltage: 220,
            avgCurrent: 10,
            avgPowerW,
            avgPowerFactor: 0.98,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })
}

async function createTrailingWindow(meterId: string, powerW: number): Promise<void> {
    for (let i = 0; i < 15; i++) {
        await createReading(meterId, new Date(TARGET_MINUTE.getTime() - i * MINUTE_MS), powerW)
    }
}

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("DemandRollupScheduler (integração)", () => {
    it("grava o rollup de demanda a partir de 15 leituras reais contíguas", async () => {
        const meterId = await setupGroupAMeter()
        await createTrailingWindow(meterId, 8000)

        await scheduler.tick(NOW)

        const rows = await demandRollupRepository.findByMeterAndPeriod(
            meterId,
            new Date(Date.UTC(2026, 8, 1, 3, 0)), // início do mês local (03h UTC = meia-noite SP)
        )

        expect(rows).toHaveLength(1)
        expect(rows[0]!.post).toBe("PEAK")
        expect(rows[0]!.maxAvgPowerW).toBe(8000)
        expect(rows[0]!.windowEndAt).toEqual(TARGET_MINUTE)
    })

    it("nunca reduz o máximo já registrado — só atualiza quando a nova janela é maior", async () => {
        const meterId = await setupGroupAMeter()
        const periodStart = new Date(Date.UTC(2026, 8, 1, 3, 0))

        // 3 janelas espaçadas 20 min entre si (> 15 min, sem sobreposição):
        // primeiro a de referência (8000), depois uma menor, depois uma maior.
        await createTrailingWindow(meterId, 8000)
        await scheduler.tick(NOW)

        const secondEnd = new Date(TARGET_MINUTE.getTime() + 20 * MINUTE_MS)
        for (let i = 0; i < 15; i++) {
            await createReading(meterId, new Date(secondEnd.getTime() - i * MINUTE_MS), 3000)
        }
        await scheduler.tick(new Date(secondEnd.getTime() + MINUTE_MS + 5_000))

        const afterSmaller = await demandRollupRepository.findByMeterAndPeriod(meterId, periodStart)
        expect(afterSmaller).toHaveLength(1)
        expect(afterSmaller[0]!.maxAvgPowerW).toBe(8000) // não regrediu

        const thirdEnd = new Date(secondEnd.getTime() + 20 * MINUTE_MS)
        for (let i = 0; i < 15; i++) {
            await createReading(meterId, new Date(thirdEnd.getTime() - i * MINUTE_MS), 12000)
        }
        await scheduler.tick(new Date(thirdEnd.getTime() + MINUTE_MS + 5_000))

        const afterLarger = await demandRollupRepository.findByMeterAndPeriod(meterId, periodStart)
        expect(afterLarger[0]!.maxAvgPowerW).toBe(12000) // subiu
    })

    it("não grava nada quando o medidor tem menos de 15 leituras (janela incompleta)", async () => {
        const meterId = await setupGroupAMeter()
        for (let i = 0; i < 10; i++) {
            await createReading(meterId, new Date(TARGET_MINUTE.getTime() - i * MINUTE_MS), 8000)
        }

        await scheduler.tick(NOW)

        const rows = await demandRollupRepository.findByMeterAndPeriod(
            meterId,
            new Date(Date.UTC(2026, 8, 1, 3, 0)),
        )
        expect(rows).toHaveLength(0)
    })

    it("não grava nada para uma propriedade do Grupo B", async () => {
        const user = await userService.createUser({
            email: "casa@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Maria",
            lastName: "Silva",
            cpf: "310.037.856-38",
        })
        const distributor = await prismaTest.energyDistributor.create({
            data: {
                name: "CEMIG",
                cnpj: "06.981.180/0001-16",
                state: "MG",
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                icmsRate: 0.18,
                pisRate: 0.0165,
                cofinsRate: 0.076,
                peakWindowStartHour: PEAK_WINDOW_START,
                peakWindowEndHour: PEAK_WINDOW_END,
            },
        })
        const property = await prismaTest.property.create({
            data: {
                userId: user.id,
                distributorId: distributor.id,
                name: "Casa",
                electricalSystem: "MONOPHASIC",
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

        for (let i = 0; i < 15; i++) {
            await createReading(meter.id, new Date(TARGET_MINUTE.getTime() - i * MINUTE_MS), 3000)
        }

        await scheduler.tick(NOW)

        const rows = await demandRollupRepository.findByMeterAndPeriod(
            meter.id,
            new Date(Date.UTC(2026, 8, 1, 3, 0)),
        )
        expect(rows).toHaveLength(0)
    })
})
