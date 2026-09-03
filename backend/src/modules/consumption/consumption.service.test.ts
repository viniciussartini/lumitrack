import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import {
    ConsumptionRepository,
    type ConsumptionBucket,
} from "@/modules/consumption/consumption.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { Granularity } from "@/modules/consumption/consumption.schema.js"
import type { TargetType } from "@/generated/prisma/client.js"
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

// `computeYearlyPropertyCosts`/`resolveBucketCost` (extraídos de `list()`)
// são privados — mesmo padrão de acesso já usado em
// IoTDataProcessor.test.ts: cast para uma interface mínima em vez de `any`.
function callComputeYearlyPropertyCosts(
    service: ConsumptionService,
    meterId: string,
    buckets: ConsumptionBucket[],
    granularity: Granularity,
    targetType: TargetType,
    property: PropertyResponse,
    distributor: DistributorResponse,
    flagPer100Kwh: number,
): Promise<Map<number, number>> {
    return (
        service as unknown as {
            computeYearlyPropertyCosts: (
                meterId: string,
                buckets: ConsumptionBucket[],
                granularity: Granularity,
                targetType: TargetType,
                property: PropertyResponse,
                distributor: DistributorResponse,
                flagPer100Kwh: number,
            ) => Promise<Map<number, number>>
        }
    ).computeYearlyPropertyCosts(
        meterId,
        buckets,
        granularity,
        targetType,
        property,
        distributor,
        flagPer100Kwh,
    )
}

function callResolveBucketCost(
    service: ConsumptionService,
    bucket: ConsumptionBucket,
    granularity: Granularity,
    targetType: TargetType,
    property: PropertyResponse,
    distributor: DistributorResponse,
    flagPer100Kwh: number,
    yearlyPropertyCostByBucketMs: Map<number, number>,
): number {
    return (
        service as unknown as {
            resolveBucketCost: (
                bucket: ConsumptionBucket,
                granularity: Granularity,
                targetType: TargetType,
                property: PropertyResponse,
                distributor: DistributorResponse,
                flagPer100Kwh: number,
                yearlyPropertyCostByBucketMs: Map<number, number>,
            ) => number
        }
    ).resolveBucketCost(
        bucket,
        granularity,
        targetType,
        property,
        distributor,
        flagPer100Kwh,
        yearlyPropertyCostByBucketMs,
    )
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

        it("também não aplica piso na granularidade year — o piso mensal é exclusivo de PROPERTY", async () => {
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
                    topic: "area/medidor-year",
                },
            })

            // 40 kWh em janeiro/2026 — abaixo do piso de 100 que só se aplica
            // a PROPERTY. Se o alvo AREA caísse (por engano) no caminho do
            // Map pré-computado de PROPERTY, o custo sairia inflado pro piso.
            await insertReading(areaMeter.id, "2026-01-15T15:00:00Z", 40, 1000)

            const result = await consumptionService.list(user.id, {
                targetType: "AREA",
                targetId: area.id,
                granularity: "year",
            })

            expect(result.items).toHaveLength(1)
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

        // COUNT(*) OVER() não tem linha pra "pendurar" o total quando o
        // LIMIT/OFFSET zera o resultado — sem o fallback pro countBuckets,
        // este caso reportaria total: 0 mesmo havendo dado.
        it("página fora do intervalo retorna items vazio com total correto (não 0)", async () => {
            const { user, meter, property } = await setupPropertyMeter()

            await insertReading(meter.id, "2026-01-15T13:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T14:00:00Z", 0.01, 600)
            await insertReading(meter.id, "2026-01-15T15:00:00Z", 0.01, 600)

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
                page: 5,
                pageSize: 2,
            })

            expect(result.items).toHaveLength(0)
            expect(result.total).toBe(3)
        })

        // Distinto do caso acima: aqui não há OFFSET (primeira página), então
        // zero linhas já prova zero grupos — o total é 0 sem precisar do
        // fallback pro countBuckets (ver skip === 0 em findAggregated).
        it("primeira página sem nenhuma leitura retorna items e total vazios", async () => {
            const { user, property } = await setupPropertyMeter()

            const result = await consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
                granularity: "hour",
                page: 1,
                pageSize: 2,
            })

            expect(result.items).toHaveLength(0)
            expect(result.total).toBe(0)
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

// Os dois métodos extraídos de `list()` — a maior parte dos casos já sai
// coberta indiretamente pelos testes de `ConsumptionService.list` acima
// (year+PROPERTY em "granularidade month/year", year+AREA em "alvo
// AREA/DEVICE"): exercitar via `list()` prova o comportamento real, sem
// acoplar o teste ao nome/assinatura de um método privado. O que sobra aqui
// são só os ramos que `list()` não consegue alcançar de forma natural —
// guards de short-circuit (a query de meses nem roda fora de year+PROPERTY)
// e o fallback defensivo de uma entrada ausente no Map (não reproduzível
// via API pública sem fabricar um estado de banco artificial que nunca
// ocorre no fluxo real, já que o Map e os buckets vêm da mesma consulta).
describe("ConsumptionService — computeYearlyPropertyCosts (privado, extraído de list())", () => {
    it("granularidade diferente de 'year' retorna Map vazio sem consultar o repositório", async () => {
        const { property } = await setupPropertyMeter()
        const distributor = (await distributorRepository.findById(property.distributorId))!
        const bucket: ConsumptionBucket = {
            bucketStart: new Date("2026-01-01T00:00:00Z"),
            kwhConsumed: 999,
            avgPowerW: 0,
        }

        const result = await callComputeYearlyPropertyCosts(
            consumptionService,
            "medidor-inexistente", // guard sai antes de tocar o repositório
            [bucket],
            "month",
            "PROPERTY",
            property,
            distributor,
            0,
        )

        expect(result.size).toBe(0)
    })

    it("alvo diferente de PROPERTY (AREA/DEVICE) retorna Map vazio mesmo com granularidade year", async () => {
        const { property } = await setupPropertyMeter()
        const distributor = (await distributorRepository.findById(property.distributorId))!
        const bucket: ConsumptionBucket = {
            bucketStart: new Date("2026-01-01T00:00:00Z"),
            kwhConsumed: 999,
            avgPowerW: 0,
        }

        const result = await callComputeYearlyPropertyCosts(
            consumptionService,
            "medidor-inexistente",
            [bucket],
            "year",
            "AREA",
            property,
            distributor,
            0,
        )

        expect(result.size).toBe(0)
    })

    it("lista de buckets vazia retorna Map vazio mesmo com granularidade year e alvo PROPERTY", async () => {
        const { property } = await setupPropertyMeter()
        const distributor = (await distributorRepository.findById(property.distributorId))!

        const result = await callComputeYearlyPropertyCosts(
            consumptionService,
            "medidor-inexistente",
            [],
            "year",
            "PROPERTY",
            property,
            distributor,
            0,
        )

        expect(result.size).toBe(0)
    })
})

// Ver comentário acima: só os ramos não alcançáveis via `list()` ficam aqui
// — year+PROPERTY com Map preenchido, month+PROPERTY e year+AREA/DEVICE já
// estão cobertos (respectivamente) pelos testes "granularidade year soma os
// custos mensais...", "aplica o piso por mês..." e "também não aplica piso
// na granularidade year..." acima.
describe("ConsumptionService — resolveBucketCost (privado, extraído de list())", () => {
    it("year+PROPERTY sem entrada correspondente no Map retorna 0 (não lança)", async () => {
        const { property } = await setupPropertyMeter()
        const distributor = (await distributorRepository.findById(property.distributorId))!
        const bucket: ConsumptionBucket = {
            bucketStart: new Date("2026-01-01T00:00:00Z"),
            kwhConsumed: 40,
            avgPowerW: 0,
        }

        const cost = callResolveBucketCost(
            consumptionService,
            bucket,
            "year",
            "PROPERTY",
            property,
            distributor,
            0,
            new Map(),
        )

        expect(cost).toBe(0)
    })
})
