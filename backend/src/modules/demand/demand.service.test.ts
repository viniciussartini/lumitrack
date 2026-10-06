import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DemandOverviewService } from "@/modules/demand/demand.service.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// Sexta-feira, 16/10/2026, 12:30 em São Paulo (UTC-3): dia útil, sem feriado.
const NOW = new Date("2026-10-16T15:30:30Z")
const DAY_START = new Date("2026-10-16T03:00:00Z")
const MONTH_START = new Date("2026-10-01T03:00:00Z")

const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const meterRepository = new MeterRepository(prismaTest)
const rollupRepository = new MeterDemandRollupRepository(prismaTest)
const userService = new UserService(new UserRepository(prismaTest))

const service = new DemandOverviewService(
    propertyRepository,
    meterRepository,
    distributorRepository,
    new MeterReadingRepository(prismaTest),
    rollupRepository,
    () => NOW,
)

const createUser = (email = "metalurgica@example.com", cnpj = "11.222.333/0001-81") =>
    userService.createUser({
        email,
        password: "Senha@123",
        userType: "COMPANY",
        acceptedTerms: true,
        companyName: "Metalúrgica Joinville Ltda",
        cnpj,
    })

async function createDistributor(withPeakWindow = true) {
    const distributor = await createTestDistributor(prismaTest)
    if (withPeakWindow) {
        await prismaTest.energyDistributor.update({
            where: { id: distributor.id },
            data: { peakWindowStartHour: 18, peakWindowEndHour: 21 },
        })
    }
    return distributor
}

async function createMeter(propertyId: string) {
    return prismaTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: `medidor/${propertyId}`,
        },
    })
}

type Setup = Awaited<ReturnType<typeof setupGroupA>>

async function setupGroupA(
    modality: "GREEN" | "BLUE" | "CONVENTIONAL_BINOMIAL" = "GREEN",
    { peakWindow = true, withMeter = true } = {},
) {
    const user = await createUser()
    const distributor = await createDistributor(peakWindow)
    const demands =
        modality === "BLUE"
            ? { contractedDemandPeakKw: 150, contractedDemandOffPeakKw: 250 }
            : { contractedDemandKw: 200 }
    const property = await propertyService.create(user.id, {
        name: "Metalúrgica",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
        tariffGroup: "GROUP_A",
        tariffSubgroup: "A4",
        tariffModality: modality,
        ...demands,
    })
    const meter = withMeter ? await createMeter(property.id) : null
    return { user, property, meter }
}

/** Uma leitura por minuto, em [from, to) (minutos UTC reais), com a potência dada. */
async function insertReadings(meterId: string, from: string, to: string, powerW: number) {
    const data = []
    for (let t = new Date(from).getTime(); t < new Date(to).getTime(); t += 60_000) {
        data.push({
            meterId,
            minuteStart: new Date(t),
            kwhConsumed: powerW / 60_000,
            avgVoltage: 380,
            avgCurrent: powerW / 380,
            avgPowerW: powerW,
            avgPowerFactor: 1,
            sampleCount: 60,
            secondsCovered: 60,
        })
    }
    await prismaTest.meterReading.createMany({ data })
}

const query = (setup: Setup) => ({ propertyId: setup.property.id })

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("DemandOverviewService — acesso", () => {
    it("recusa propriedade do Grupo B no servidor", async () => {
        const user = await createUser()
        const distributor = await createDistributor()
        const property = await propertyService.create(user.id, {
            name: "Casa",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
        })
        await createMeter(property.id)

        await expect(service.overview(user.id, { propertyId: property.id })).rejects.toThrow(
            /Grupo A/,
        )
    })

    it("nega a propriedade de outro usuário", async () => {
        const setup = await setupGroupA()
        const other = await createUser("outro@example.com", "22.333.444/0001-81")

        await expect(service.overview(other.id, query(setup))).rejects.toThrow(ForbiddenError)
    })

    it("propriedade inexistente é 404", async () => {
        const setup = await setupGroupA()

        await expect(
            service.overview(setup.user.id, {
                propertyId: "00000000-0000-4000-8000-000000000000",
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("propriedade sem medidor é 404", async () => {
        const setup = await setupGroupA("GREEN", { withMeter: false })

        await expect(service.overview(setup.user.id, query(setup))).rejects.toThrow(/medidor/i)
    })

    it("propertyId inválido é rejeitado na borda", async () => {
        const setup = await setupGroupA()

        await expect(service.overview(setup.user.id, { propertyId: "nao-e-uuid" })).rejects.toThrow(
            ValidationError,
        )
        await expect(service.overview(setup.user.id, {})).rejects.toThrow(ValidationError)
    })

    it("modalidade ainda sem cálculo (Convencional Binômia) falha fechada", async () => {
        const setup = await setupGroupA("CONVENTIONAL_BINOMIAL")

        await expect(service.overview(setup.user.id, query(setup))).rejects.toThrow(
            /ainda não suportado/,
        )
    })

    it("Azul sem janela de ponta na distribuidora falha fechada: não adivinha o horário", async () => {
        const setup = await setupGroupA("BLUE", { peakWindow: false })

        await expect(service.overview(setup.user.id, query(setup))).rejects.toThrow(/ponta/i)
    })
})

describe("DemandOverviewService — dia sem janela medida", () => {
    it("tudo é ausência (null), nunca 0 kW", async () => {
        const setup = await setupGroupA()

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.current.kw).toBeNull()
        expect(result.monthMax).toEqual({ kw: null, windowEnd: null })
        expect(result.exceedancePercent).toBeNull()
        expect(result.day.points).toHaveLength(96)
        expect(result.day.points.every((point) => point.kw === null)).toBe(true)
    })

    it("buraco de leitura derruba só a janela que o contém", async () => {
        const setup = await setupGroupA()
        // 12:00-12:29 SP, com o minuto 12:05 faltando
        await insertReadings(
            setup.meter!.id,
            "2026-10-16T15:00:00Z",
            "2026-10-16T15:05:00Z",
            150_000,
        )
        await insertReadings(
            setup.meter!.id,
            "2026-10-16T15:06:00Z",
            "2026-10-16T15:30:00Z",
            150_000,
        )

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.day.points[48]!.kw).toBeNull() // 12:00-12:14 tem o buraco
        expect(result.day.points[49]!.kw).toBeCloseTo(150) // 12:15-12:29 completa
    })
})

describe("DemandOverviewService — Verde", () => {
    it("devolve a demanda atual, a curva do dia e a contratada", async () => {
        const setup = await setupGroupA()
        await insertReadings(
            setup.meter!.id,
            "2026-10-16T15:00:00Z",
            "2026-10-16T15:30:00Z",
            150_000,
        )

        const result = await service.overview(setup.user.id, query(setup))

        expect(result).toMatchObject({
            propertyId: setup.property.id,
            modality: "GREEN",
            windowMinutes: 15,
            contracted: [{ post: null, kw: 200 }],
            day: { date: "2026-10-16" },
        })
        // minuto-alvo = 12:29 (o anterior ao corrente, 12:30): janela 12:15-12:29
        expect(result.current.kw).toBeCloseTo(150)
        expect(result.current.windowEnd).toEqual(new Date("2026-10-16T15:29:00Z"))
        expect(result.day.points[0]!.windowEnd).toEqual(new Date(DAY_START.getTime() + 14 * 60_000))
        expect(result.day.points[48]!.kw).toBeCloseTo(150)
        expect(result.day.points[49]!.kw).toBeCloseTo(150)
        expect(result.day.points[50]!.kw).toBeNull() // 12:30-12:44 ainda não fechou
        expect(result.day.points.every((point) => point.contractedKw === 200)).toBe(true)
    })

    it("máxima do mês vem do rollup, em kW, e a ultrapassagem é o estouro sobre a contratada", async () => {
        const setup = await setupGroupA()
        const windowEnd = new Date("2026-10-09T21:14:00Z")
        await rollupRepository.upsertIfGreater(
            setup.meter!.id,
            MONTH_START,
            "PEAK",
            230_000,
            windowEnd,
        )
        await rollupRepository.upsertIfGreater(
            setup.meter!.id,
            MONTH_START,
            "OFF_PEAK",
            190_000,
            windowEnd,
        )

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.monthMax).toEqual({ kw: 230, windowEnd })
        expect(result.exceedancePercent).toBeCloseTo(15)
    })

    it("dentro da contratada não há ultrapassagem (0)", async () => {
        const setup = await setupGroupA()
        await rollupRepository.upsertIfGreater(
            setup.meter!.id,
            MONTH_START,
            "OFF_PEAK",
            180_000,
            new Date("2026-10-09T15:14:00Z"),
        )

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.monthMax.kw).toBe(180)
        expect(result.exceedancePercent).toBe(0)
    })

    it("ignora o rollup de outro mês", async () => {
        const setup = await setupGroupA()
        await rollupRepository.upsertIfGreater(
            setup.meter!.id,
            new Date("2026-09-01T03:00:00Z"),
            "OFF_PEAK",
            500_000,
            new Date("2026-09-09T15:14:00Z"),
        )

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.monthMax.kw).toBeNull()
    })

    it("classifica o posto de cada janela: a ponta (18h-21h) só em dia útil", async () => {
        const setup = await setupGroupA()

        const { day } = await service.overview(setup.user.id, query(setup))

        const postAt = (hour: number, quarter = 0) => day.points[hour * 4 + quarter]!.post
        expect(postAt(12)).toBe("OFF_PEAK")
        expect(postAt(18)).toBe("PEAK")
        expect(postAt(20, 3)).toBe("PEAK")
        expect(postAt(21)).toBe("OFF_PEAK")
    })
})

describe("DemandOverviewService — Azul", () => {
    it("a contratada vira degrau: cada janela usa a do posto dela", async () => {
        const setup = await setupGroupA("BLUE")

        const result = await service.overview(setup.user.id, query(setup))

        expect(result.contracted).toEqual([
            { post: "PEAK", kw: 150 },
            { post: "OFF_PEAK", kw: 250 },
        ])
        const at = (hour: number) => result.day.points[hour * 4]!.contractedKw
        expect(at(12)).toBe(250)
        expect(at(19)).toBe(150)
        expect(at(22)).toBe(250)
    })

    it("a ultrapassagem é o pior estouro entre os postos", async () => {
        const setup = await setupGroupA("BLUE")
        const end = new Date("2026-10-09T15:14:00Z")
        await rollupRepository.upsertIfGreater(setup.meter!.id, MONTH_START, "PEAK", 180_000, end)
        await rollupRepository.upsertIfGreater(
            setup.meter!.id,
            MONTH_START,
            "OFF_PEAK",
            200_000,
            end,
        )

        const result = await service.overview(setup.user.id, query(setup))

        // ponta: 180 de 150 = +20%; fora de ponta: 200 de 250 não passa
        expect(result.exceedancePercent).toBeCloseTo(20)
        expect(result.monthMax.kw).toBe(200)
    })
})
