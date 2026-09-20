import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DemandAlertRepository } from "@/modules/demand-alert/demand-alert.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PldQuoteRepository } from "@/modules/pld-quote/pld-quote.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

// Contrato de toda listagem paginada: a ordem é total. Quando a coluna de
// ordenação empata (nomes iguais, mesmo instante), o PostgreSQL não garante a
// mesma ordem entre duas consultas, e skip/take repetem ou omitem linhas entre
// páginas. Cada caso semeia linhas com a chave de ordenação IDÊNTICA e confere
// que as páginas, concatenadas, são a lista inteira, sem repetição e em ordem
// estável de `id`.

const SAME_INSTANT = new Date("2026-01-01T12:00:00.000Z")
const ROWS = 23
const PAGE_SIZE = 5
const MAX_PAGE_SIZE = 31

// `leadingKey` só é preenchida quando a listagem não empata TODAS as linhas:
// é a chave de ordenação principal, que precede o desempate por id.
type Item = { id: string; leadingKey?: string }

type ListPage = (page: number, pageSize: number) => Promise<{ items: Item[] }>

type Case = {
    name: string
    direction: "asc" | "desc"
    rows: number
    setup: () => Promise<ListPage>
}

const repeat = <T>(count: number, build: (index: number) => T): T[] =>
    Array.from({ length: count }, (_, index) => build(index))

async function createUser() {
    return prismaTest.user.create({
        data: { email: "tie@example.com", password: "hash", userType: "INDIVIDUAL" },
    })
}

async function createProperty(userId: string, distributorId: string) {
    return prismaTest.property.create({
        data: { userId, distributorId, name: "Casa", electricalSystem: "MONOPHASIC" },
    })
}

async function createUserAndProperty() {
    const user = await createUser()
    const distributor = await createTestDistributor(prismaTest)
    const property = await createProperty(user.id, distributor.id)
    return { user, distributor, property }
}

async function createPropertyMeter(propertyId: string) {
    return prismaTest.meter.create({
        data: { name: "Geral", targetType: "PROPERTY", propertyId, protocol: "MQTT" },
    })
}

const cases: Case[] = [
    {
        name: "properties",
        direction: "asc",
        rows: ROWS,
        setup: async () => {
            const user = await createUser()
            const distributor = await createTestDistributor(prismaTest)
            await prismaTest.property.createMany({
                data: repeat(ROWS, () => ({
                    userId: user.id,
                    distributorId: distributor.id,
                    name: "Casa",
                    electricalSystem: "MONOPHASIC" as const,
                })),
            })
            const repository = new PropertyRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByUserPaginated(user.id, { page, pageSize })
        },
    },
    {
        name: "areas",
        direction: "asc",
        rows: ROWS,
        setup: async () => {
            const { property } = await createUserAndProperty()
            await prismaTest.area.createMany({
                data: repeat(ROWS, () => ({ propertyId: property.id, name: "Sala" })),
            })
            const repository = new AreaRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByPropertyPaginated(property.id, { page, pageSize })
        },
    },
    {
        name: "devices",
        direction: "asc",
        rows: ROWS,
        setup: async () => {
            const { property } = await createUserAndProperty()
            const area = await prismaTest.area.create({
                data: { propertyId: property.id, name: "Sala" },
            })
            await prismaTest.device.createMany({
                data: repeat(ROWS, () => ({ areaId: area.id, name: "Lâmpada" })),
            })
            const repository = new DeviceRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByAreaPaginated(area.id, { page, pageSize })
        },
    },
    {
        name: "meters",
        direction: "asc",
        rows: ROWS,
        setup: async () => {
            const { user, property } = await createUserAndProperty()
            const areas = await prismaTest.area.createManyAndReturn({
                data: repeat(ROWS, () => ({ propertyId: property.id, name: "Sala" })),
            })
            await prismaTest.meter.createMany({
                data: areas.map((area) => ({
                    name: "Medidor",
                    targetType: "AREA" as const,
                    areaId: area.id,
                    protocol: "MQTT" as const,
                })),
            })
            const repository = new MeterRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByUserPaginated(user.id, { page, pageSize })
        },
    },
    {
        name: "distributors",
        direction: "asc",
        rows: ROWS,
        setup: async () => {
            for (let index = 0; index < ROWS; index++) {
                await createTestDistributor(prismaTest, { name: "Distribuidora" })
            }
            const repository = new DistributorRepository(prismaTest)
            return (page, pageSize) => repository.findAll({ page, pageSize })
        },
    },
    {
        name: "alerts",
        direction: "desc",
        rows: ROWS,
        setup: async () => {
            const { user, property } = await createUserAndProperty()
            const meter = await createPropertyMeter(property.id)
            await prismaTest.alert.createMany({
                data: repeat(ROWS, () => ({
                    userId: user.id,
                    meterId: meter.id,
                    name: "Pico",
                    referencePowerKw: 1,
                    tolerancePercent: 2,
                    createdAt: SAME_INSTANT,
                })),
            })
            const repository = new AlertRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByUserPaginated(user.id, { page, pageSize })
        },
    },
    {
        name: "alert trigger events",
        direction: "desc",
        rows: ROWS,
        setup: async () => {
            const { user, property } = await createUserAndProperty()
            const meter = await createPropertyMeter(property.id)
            const alert = await prismaTest.alert.create({
                data: {
                    userId: user.id,
                    meterId: meter.id,
                    name: "Pico",
                    referencePowerKw: 1,
                    tolerancePercent: 2,
                },
            })
            await prismaTest.alertTriggerEvent.createMany({
                data: repeat(ROWS, () => ({
                    alertId: alert.id,
                    startedAt: SAME_INSTANT,
                    endedAt: new Date(SAME_INSTANT.getTime() + 60_000),
                    durationSeconds: 60,
                    minPowerW: 1,
                    maxPowerW: 2,
                    avgPowerW: 1.5,
                    sampleCount: 3,
                })),
            })
            const repository = new AlertTriggerEventRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByAlertPaginated(alert.id, { page, pageSize })
        },
    },
    {
        name: "demand alerts",
        direction: "desc",
        rows: ROWS,
        setup: async () => {
            const { user, property } = await createUserAndProperty()
            const meter = await createPropertyMeter(property.id)
            await prismaTest.demandAlert.createMany({
                data: repeat(ROWS, () => ({
                    userId: user.id,
                    meterId: meter.id,
                    name: "Demanda",
                    thresholdPercent: 90,
                    createdAt: SAME_INSTANT,
                })),
            })
            const repository = new DemandAlertRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByUserPaginated(user.id, { page, pageSize })
        },
    },
    {
        name: "ACL contracts",
        direction: "desc",
        rows: ROWS,
        setup: async () => {
            const { user, property } = await createUserAndProperty()
            await prismaTest.aclContract.createMany({
                data: repeat(ROWS, () => ({
                    userId: user.id,
                    propertyId: property.id,
                    retailerName: "Comercializadora",
                    submarket: "SOUTH" as const,
                    energySource: "CONVENTIONAL" as const,
                    energyPricePerMwh: 250,
                    contractedVolumeMwh: 10,
                    validFrom: SAME_INSTANT,
                })),
            })
            const repository = new AclContractRepository(prismaTest)
            return (page, pageSize) =>
                repository.findAllByUserPaginated(user.id, { page, pageSize })
        },
    },
    {
        name: "PLD quotes",
        direction: "desc",
        // A chave única (submercado, período) limita o empate a 4 cotações
        // por período — 4 períodos × 4 submercados dão 16 linhas.
        rows: 16,
        setup: async () => {
            const submarkets = ["NORTH", "NORTHEAST", "SOUTHEAST_CENTER_WEST", "SOUTH"] as const
            await prismaTest.pldQuote.createMany({
                data: [0, 1, 2, 3].flatMap((month) =>
                    submarkets.map((submarket) => ({
                        submarket,
                        referencePeriod: new Date(Date.UTC(2026, month, 1)),
                        valuePerMwh: 100,
                    })),
                ),
            })
            const repository = new PldQuoteRepository(prismaTest)
            return async (page, pageSize) => {
                const result = await repository.findAllPaginated({ page, pageSize })
                return {
                    items: result.items.map((item) => ({
                        id: item.id,
                        leadingKey: item.referencePeriod.toISOString(),
                    })),
                }
            }
        },
    },
]

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("listagens paginadas — ordem total com chave de ordenação empatada", () => {
    it.each(cases)(
        "$name: páginas concatenadas são a lista inteira, sem repetição e em ordem de id",
        async ({ direction, rows, setup }) => {
            const list = await setup()

            const paged: string[] = []
            for (let page = 1; page <= Math.ceil(rows / PAGE_SIZE); page++) {
                const result = await list(page, PAGE_SIZE)
                paged.push(...result.items.map((item) => item.id))
            }
            const wholeItems = (await list(1, MAX_PAGE_SIZE)).items
            const whole = wholeItems.map((item) => item.id)

            expect(whole).toHaveLength(rows)
            expect(new Set(paged).size).toBe(rows)
            expect(paged).toEqual(whole)

            const sign = direction === "asc" ? 1 : -1
            const expectedOrder = [...wholeItems]
                .sort(
                    (a, b) =>
                        sign * (a.leadingKey ?? "").localeCompare(b.leadingKey ?? "") ||
                        sign * (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
                )
                .map((item) => item.id)
            expect(whole).toEqual(expectedOrder)
        },
    )
})
