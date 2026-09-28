import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { MeterReadingService } from "@/modules/meter/meter-reading.service.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const meterRepository = new MeterRepository(prismaTest)
const meterReadingRepository = new MeterReadingRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prismaTest)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const meterReadingService = new MeterReadingService(
    meterReadingRepository,
    meterRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
)

async function setupPropertyMeter() {
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
        electricalSystem: "MONOPHASIC",
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

async function insertReading(meterId: string, minuteStart: string, avgPowerW: number) {
    return prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart: new Date(minuteStart),
            kwhConsumed: 0.01,
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

describe("MeterReadingService.list", () => {
    it("lança ValidationError sem from/to (obrigatórios, ao contrário de /api/consumption)", async () => {
        const { user, property } = await setupPropertyMeter()

        await expect(
            meterReadingService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "minute",
            }),
        ).rejects.toThrow(ValidationError)
    })

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
        const property = await propertyService.create(user.id, {
            name: "Casa",
            distributorId: distributor.id,
            electricalSystem: "MONOPHASIC",
        })

        await expect(
            meterReadingService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "minute",
                from: "2026-01-15T00:00:00Z",
                to: "2026-01-16T00:00:00Z",
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
            meterReadingService.list(userB.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "minute",
                from: "2026-01-15T00:00:00Z",
                to: "2026-01-16T00:00:00Z",
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("devolve os baldes agregados dentro da janela, com a granularidade ecoada", async () => {
        const { user, meter, property } = await setupPropertyMeter()

        await insertReading(meter.id, "2026-01-15T14:10:00Z", 1000)
        await insertReading(meter.id, "2026-01-15T14:20:00Z", 2000)
        await insertReading(meter.id, "2026-01-15T20:00:00Z", 9999) // fora da janela

        const result = await meterReadingService.list(user.id, {
            targetType: "PROPERTY",
            targetId: property.id,
            granularity: "hour",
            from: "2026-01-15T14:00:00Z",
            to: "2026-01-15T15:00:00Z",
        })

        expect(result.granularity).toBe("hour")
        expect(result.items).toHaveLength(1)
        expect(result.items[0]!.avgPowerW).toBeCloseTo(1500)
    })

    it("funciona também para alvo AREA (sem medidor de propriedade)", async () => {
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
        await insertReading(areaMeter.id, "2026-01-15T14:10:00Z", 500)

        const result = await meterReadingService.list(user.id, {
            targetType: "AREA",
            targetId: area.id,
            granularity: "minute",
            from: "2026-01-15T14:00:00Z",
            to: "2026-01-15T15:00:00Z",
        })

        expect(result.items).toHaveLength(1)
        expect(result.items[0]!.avgPowerW).toBeCloseTo(500)
    })
})

describe("MeterReadingService.comparePeriods", () => {
    it("lança ValidationError quando período A e B têm durações diferentes", async () => {
        const { user, property } = await setupPropertyMeter()

        await expect(
            meterReadingService.comparePeriods(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                metric: "tensao",
                fromA: "2026-01-15T00:00:00Z",
                toA: "2026-01-16T00:00:00Z", // 1 dia
                fromB: "2026-02-01T00:00:00Z",
                toB: "2026-02-04T00:00:00Z", // 3 dias
            }),
        ).rejects.toThrow(ValidationError)
    })

    it.each([
        [
            "só o período A invertido",
            { fromA: "2026-01-16T00:00:00Z", toA: "2026-01-15T00:00:00Z" },
            "Período A: to deve ser depois de from",
        ],
        [
            "só o período B invertido",
            { fromB: "2026-02-02T00:00:00Z", toB: "2026-02-01T00:00:00Z" },
            "Período B: to deve ser depois de from",
        ],
    ])("recusa %s, com a mensagem do período certo", async (_name, override, message) => {
        const { user, property } = await setupPropertyMeter()

        await expect(
            meterReadingService.comparePeriods(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                metric: "tensao",
                fromA: "2026-01-15T00:00:00Z",
                toA: "2026-01-16T00:00:00Z",
                fromB: "2026-02-01T00:00:00Z",
                toB: "2026-02-02T00:00:00Z",
                ...override,
            }),
        ).rejects.toThrow(message)
    })

    it("teto de 92 dias: exatamente 92 dias passa; 92 dias e 1 ms é recusado", async () => {
        const { user, property } = await setupPropertyMeter()
        const base = {
            targetType: "PROPERTY",
            targetId: property.id,
            metric: "tensao",
        }
        const DAY_MS = 24 * 60 * 60 * 1000
        const from = new Date("2026-01-01T03:00:00Z").getTime()

        const atLimit = await meterReadingService.comparePeriods(user.id, {
            ...base,
            fromA: new Date(from).toISOString(),
            toA: new Date(from + 92 * DAY_MS).toISOString(),
            fromB: new Date(from + 100 * DAY_MS).toISOString(),
            toB: new Date(from + 192 * DAY_MS).toISOString(),
        })
        expect(atLimit.periodA.items).toHaveLength(92)

        await expect(
            meterReadingService.comparePeriods(user.id, {
                ...base,
                fromA: new Date(from).toISOString(),
                toA: new Date(from + 92 * DAY_MS + 1).toISOString(),
                fromB: new Date(from + 100 * DAY_MS).toISOString(),
                toB: new Date(from + 192 * DAY_MS + 1).toISOString(),
            }),
        ).rejects.toThrow("Cada período não pode exceder 92 dias")
    })

    it("lança ValidationError quando um período excede o teto de dias", async () => {
        const { user, property } = await setupPropertyMeter()

        await expect(
            meterReadingService.comparePeriods(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                metric: "tensao",
                fromA: "2026-01-01T00:00:00Z",
                toA: "2026-06-01T00:00:00Z", // bem mais que 92 dias
                fromB: "2026-07-01T00:00:00Z",
                toB: "2026-12-01T00:00:00Z",
            }),
        ).rejects.toThrow(ValidationError)
    })

    it("lança NotFoundError quando o alvo não tem medidor vinculado", async () => {
        const user = await userService.createUser({
            email: "semmedidor2@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Sem",
            lastName: "Medidor",
            cpf: "310.037.856-38",
        })
        const distributor = await createTestDistributor(prismaTest)
        const property = await propertyService.create(user.id, {
            name: "Casa",
            distributorId: distributor.id,
            electricalSystem: "MONOPHASIC",
        })

        await expect(
            meterReadingService.comparePeriods(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                metric: "tensao",
                fromA: "2026-01-15T00:00:00Z",
                toA: "2026-01-16T00:00:00Z",
                fromB: "2026-02-01T00:00:00Z",
                toB: "2026-02-02T00:00:00Z",
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("lança ForbiddenError quando a propriedade pertence a outro usuário", async () => {
        const { property } = await setupPropertyMeter()
        const userB = await userService.createUser({
            email: "outro2@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Outro",
            lastName: "Usuário",
            cpf: "310.037.856-38",
        })

        await expect(
            meterReadingService.comparePeriods(userB.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                metric: "tensao",
                fromA: "2026-01-15T00:00:00Z",
                toA: "2026-01-16T00:00:00Z",
                fromB: "2026-02-01T00:00:00Z",
                toB: "2026-02-02T00:00:00Z",
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("compara dois períodos de mesma duração, devolvendo baldes completos e a diferença de B sobre A", async () => {
        const { user, meter, property } = await setupPropertyMeter()

        await insertReading(meter.id, "2026-01-15T10:00:00Z", 1000) // período A
        await insertReading(meter.id, "2026-02-10T10:00:00Z", 1500) // período B

        const result = await meterReadingService.comparePeriods(user.id, {
            targetType: "PROPERTY",
            targetId: property.id,
            metric: "pativa",
            fromA: "2026-01-15T00:00:00Z",
            toA: "2026-01-16T00:00:00Z",
            fromB: "2026-02-10T00:00:00Z",
            toB: "2026-02-11T00:00:00Z",
        })

        expect(result.metric).toBe("pativa")
        expect(result.granularity).toBe("hour")
        expect(result.periodA.items).toHaveLength(24)
        expect(result.periodB.items).toHaveLength(24)
        expect(result.periodA.summary.avg).toBeCloseTo(1000)
        expect(result.periodB.summary.avg).toBeCloseTo(1500)
        expect(result.diff.absolute).toBeCloseTo(500)
        expect(result.diff.percent).toBeCloseTo(50)
    })
})
