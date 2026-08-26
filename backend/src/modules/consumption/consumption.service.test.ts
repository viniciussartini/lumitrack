import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import {
    createTestDistributor,
    createTestTariffFlagConfig,
} from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"

const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prismaTest)
const tariffFlagRepository = new TariffFlagRepository(prismaTest)
const consumptionRepository = new ConsumptionRepository(prismaTest)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const consumptionService = new ConsumptionService(
    consumptionRepository,
    meterRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
    distributorRepository,
    tariffFlagRepository,
)

// tusdPerKwh=0.3 + tePerKwh=0.3 = 0.6 R$/kWh; tributos 27,25%; bandeira
// GREEN = 0 — mesma fórmula "por dentro" usada no TariffService.
const RATE = 0.6 / (1 - 0.2725)

async function setupPropertyMeter(email = "joao@example.com") {
    const user = await userService.createUser({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: email === "joao@example.com" ? "529.982.247-25" : "310.037.856-38",
    })
    const distributor = await createTestDistributor(prismaTest)
    await createTestTariffFlagConfig(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC", // piso de 100 kWh
    })
    const meter = await prismaTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/medidor",
        },
    })
    return { user, property, meter }
}

async function insertReading(
    meterId: string,
    minuteStart: string,
    kwhConsumed: number,
    avgPowerW: number,
) {
    return prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart: new Date(minuteStart),
            kwhConsumed,
            avgVoltage: 220,
            avgCurrent: avgPowerW / 220,
            avgPowerW,
            avgPowerFactor: 1,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("ConsumptionService.list", () => {
    describe("validação de acesso", () => {
        it("lança NotFoundError quando o alvo não tem medidor vinculado", async () => {
            const user = await userService.createUser({
                email: "semmedidor@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "Sem",
                lastName: "Medidor",
                cpf: "310.037.856-38",
            })
            const distributor = await createTestDistributor(prismaTest)
            await createTestTariffFlagConfig(prismaTest)
            const property = await propertyService.create(user.id, {
                name: "Casa",
                distributorId: distributor.id,
                electricalSystem: "MONOPHASIC",
            })

            await expect(
                consumptionService.list(user.id, {
                    targetType: "PROPERTY",
                    targetId: property.id,
                    granularity: "hour",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError quando a propriedade pertence a outro usuário", async () => {
            const { property } = await setupPropertyMeter()
            const userB = await userService.createUser({
                email: "outro@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "Outro",
                lastName: "Usuário",
                cpf: "310.037.856-38",
            })

            await expect(
                consumptionService.list(userB.id, {
                    targetType: "PROPERTY",
                    targetId: property.id,
                    granularity: "hour",
                }),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("granularidade hour", () => {
        it("agrega leituras no mesmo horário local (SP) num único bucket", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            // 13:05Z e 13:45Z → mesma hora em SP (UTC-3 → 10h); 14:10Z → 11h SP.
            await insertReading(meter.id, "2026-01-15T13:05:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T13:45:00Z", 0.02, 1200)
            await insertReading(meter.id, "2026-01-15T14:10:00Z", 0.03, 1800)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
            })

            expect(result.total).toBe(2)
            expect(result.items).toHaveLength(2)
            // ORDER BY bucket DESC — hora 11 (mais recente) vem primeiro
            expect(result.items[0]!.kwhConsumed).toBeCloseTo(0.03)
            expect(result.items[0]!.avgPowerW).toBeCloseTo(1800)
            expect(result.items[1]!.kwhConsumed).toBeCloseTo(0.03)
            expect(result.items[1]!.avgPowerW).toBeCloseTo(900) // média ponderada: (600×60+1200×60)/120
        })
    })

    describe("granularidade minute — janela de uma hora, bucket por minuto", () => {
        it("devolve um bucket por minuto e ignora leituras fora da janela from/to", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            // Janela = hora 10 em SP (13:00Z–14:00Z).
            await insertReading(meter.id, "2026-01-15T13:05:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T13:06:00Z", 0.02, 1200)
            await insertReading(meter.id, "2026-01-15T13:59:00Z", 0.03, 1800)
            // Fora da janela — hora seguinte.
            await insertReading(meter.id, "2026-01-15T14:10:00Z", 0.09, 5400)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "minute",
                from: "2026-01-15T13:00:00Z",
                to: "2026-01-15T14:00:00Z",
                order: "asc",
            })

            expect(result.total).toBe(3)
            expect(result.items.map((item) => item.kwhConsumed)).toEqual([0.01, 0.02, 0.03])
        })
    })

    describe("ordenação dos buckets", () => {
        it("order=asc devolve em ordem cronológica crescente", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            await insertReading(meter.id, "2026-01-15T13:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T14:00:00Z", 0.02, 600)
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 0.03, 600)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
                order: "asc",
            })

            expect(result.items.map((item) => item.kwhConsumed)).toEqual([0.01, 0.02, 0.03])
        })

        it("sem order explícito mantém o mais recente primeiro (DESC)", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            await insertReading(meter.id, "2026-01-15T13:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T14:00:00Z", 0.02, 600)
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 0.03, 600)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
            })

            expect(result.items.map((item) => item.kwhConsumed)).toEqual([0.03, 0.02, 0.01])
        })
    })

    describe("granularidade day — virada de dia em America/Sao_Paulo", () => {
        it("separa leituras do mesmo dia UTC em dias SP diferentes", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            // Ambos no dia UTC 2026-01-15, mas em dias SP diferentes (UTC-3):
            // 02:30Z → 2026-01-14 23:30 SP; 04:00Z → 2026-01-15 01:00 SP.
            await insertReading(meter.id, "2026-01-15T02:30:00Z", 0.05, 3000)
            await insertReading(meter.id, "2026-01-15T04:00:00Z", 0.07, 4200)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "day",
            })

            expect(result.total).toBe(2)
        })
    })

    describe("granularidade month/year — piso de disponibilidade (alvo PROPERTY)", () => {
        it("aplica o piso por mês na granularidade month quando abaixo de 100 kWh (TRIPHASIC)", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            // 40 kWh em janeiro/2026 (SP) — abaixo do piso de 100.
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 40, 1000)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "month",
            })

            expect(result.items).toHaveLength(1)
            expect(result.items[0]!.kwhConsumed).toBeCloseTo(40)
            expect(result.items[0]!.costBrl).toBeCloseTo(100 * RATE, 6)
        })

        it("granularidade year soma os custos mensais (cada um com seu piso), não o piso aplicado uma vez sobre o total anual", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            // 40 kWh em janeiro e 30 kWh em fevereiro/2026 (SP) — ambos abaixo do piso de 100.
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 40, 1000)
            await insertReading(meter.id, "2026-02-15T15:00:00Z", 30, 1000)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "year",
            })

            expect(result.items).toHaveLength(1)
            expect(result.items[0]!.kwhConsumed).toBeCloseTo(70) // exibição = soma real
            // custo correto = 100×RATE (jan) + 100×RATE (fev), não 100×RATE (piso único) nem 70×RATE
            expect(result.items[0]!.costBrl).toBeCloseTo(200 * RATE, 6)
        })
    })

    describe("alvo AREA/DEVICE — sem piso nem CIP", () => {
        it("não aplica piso de disponibilidade mesmo abaixo de 100 kWh no mês", async () => {
            const { user, property } = await setupPropertyMeter()
            const area = await areaService.create(property.id, user.id, { name: "Sala" })
            const areaMeter = await prismaTest.meter.create({
                data: {
                    name: "Medidor Área",
                    targetType: "AREA",
                    areaId: area.id,
                    protocol: "MQTT",
                    host: "localhost",
                    port: 1883,
                    topic: "area/medidor",
                },
            })

            await insertReading(areaMeter.id, "2026-01-15T15:00:00Z", 40, 1000)

            const result = await consumptionService.list(user.id, {
                targetType: "AREA",
                targetId: area.id,
                granularity: "month",
            })

            expect(result.items[0]!.costBrl).toBeCloseTo(40 * RATE, 6)
        })
    })

    describe("paginação", () => {
        it("respeita page e pageSize sobre os buckets", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            await insertReading(meter.id, "2026-01-15T13:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T14:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 0.01, 600)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
                page: 1,
                pageSize: 2,
            })

            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(3)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ConsumptionService.summary — endpoint batch, 1 bucket
// mais recente por alvo, autorização verificada por id da lista.
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionService.summary", () => {
    it("retorna o bucket mais recente de cada propriedade própria, na mesma chamada", async () => {
        const { user, meter: meterA, property: propertyA } = await setupPropertyMeter()
        const distributor = await createTestDistributor(prismaTest)
        const propertyB = await propertyService.create(user.id, {
            name: "Sítio",
            distributorId: distributor.id,
            electricalSystem: "MONOPHASIC",
        })
        const meterB = await prismaTest.meter.create({
            data: {
                name: "Medidor B",
                targetType: "PROPERTY",
                propertyId: propertyB.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "sitio/medidor",
            },
        })
        await insertReading(meterA.id, "2026-01-15T15:00:00Z", 40, 1000)
        await insertReading(meterB.id, "2026-01-10T15:00:00Z", 10, 500)

        const result = await consumptionService.summary(user.id, {
            targetType: "PROPERTY",
            ids: `${propertyA.id},${propertyB.id}`,
            granularity: "month",
        })

        const byId = new Map(result.items.map((item) => [item.id, item]))
        expect(byId.get(propertyA.id)?.kwhConsumed).toBeCloseTo(40)
        expect(byId.get(propertyB.id)?.kwhConsumed).toBeCloseTo(10)
    })

    it("exclui silenciosamente ids de outro usuário — não derruba o lote", async () => {
        const { user: userA, property: propertyA, meter: meterA } = await setupPropertyMeter()
        const userB = await userService.createUser({
            email: "outro-summary@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Outro",
            lastName: "Usuário",
            cpf: "310.037.856-38",
        })
        const distributorB = await createTestDistributor(prismaTest)
        const propertyB = await propertyService.create(userB.id, {
            name: "Casa de B",
            distributorId: distributorB.id,
            electricalSystem: "MONOPHASIC",
        })
        const meterB = await prismaTest.meter.create({
            data: {
                name: "Medidor B",
                targetType: "PROPERTY",
                propertyId: propertyB.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "b/medidor",
            },
        })
        await insertReading(meterA.id, "2026-01-15T15:00:00Z", 40, 1000)
        await insertReading(meterB.id, "2026-01-15T15:00:00Z", 40, 1000)

        const result = await consumptionService.summary(userA.id, {
            targetType: "PROPERTY",
            ids: `${propertyA.id},${propertyB.id}`,
            granularity: "month",
        })

        expect(result.items).toHaveLength(1)
        expect(result.items[0]!.id).toBe(propertyA.id)
    })

    it("exclui silenciosamente id inexistente — não lança", async () => {
        const { user, meter, property } = await setupPropertyMeter()
        await insertReading(meter.id, "2026-01-15T15:00:00Z", 40, 1000)

        const result = await consumptionService.summary(user.id, {
            targetType: "PROPERTY",
            ids: `${property.id},00000000-0000-0000-0000-000000000000`,
            granularity: "month",
        })

        expect(result.items.map((i) => i.id)).toEqual([property.id])
    })

    it("retorna items vazio (200, não erro) quando nenhum id sobrevive à autorização", async () => {
        const { user: userA } = await setupPropertyMeter()
        const { property: propertyB } = await setupPropertyMeter("maria-summary@example.com")

        const result = await consumptionService.summary(userA.id, {
            targetType: "PROPERTY",
            ids: propertyB.id,
            granularity: "month",
        })

        expect(result.items).toEqual([])
    })

    it("granularity year + PROPERTY soma os custos mensais (mesmo comportamento de list())", async () => {
        const { user, meter, property } = await setupPropertyMeter()
        await insertReading(meter.id, "2026-01-15T15:00:00Z", 40, 1000)
        await insertReading(meter.id, "2026-02-15T15:00:00Z", 30, 1000)

        const result = await consumptionService.summary(user.id, {
            targetType: "PROPERTY",
            ids: property.id,
            granularity: "year",
        })

        expect(result.items).toHaveLength(1)
        expect(result.items[0]!.kwhConsumed).toBeCloseTo(70)
        expect(result.items[0]!.costBrl).toBeCloseTo(200 * RATE, 6)
    })

    it("lança ValidationError para lote vazio", async () => {
        const { user } = await setupPropertyMeter()

        await expect(
            consumptionService.summary(user.id, {
                targetType: "PROPERTY",
                ids: "",
                granularity: "month",
            }),
        ).rejects.toThrow()
    })

    it("lança ValidationError para lote acima do teto de 50", async () => {
        const { user } = await setupPropertyMeter()
        const tooMany = Array.from(
            { length: 51 },
            () => "00000000-0000-0000-0000-000000000000",
        ).join(",")

        await expect(
            consumptionService.summary(user.id, {
                targetType: "PROPERTY",
                ids: tooMany,
                granularity: "month",
            }),
        ).rejects.toThrow()
    })
})
