import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ReportService } from "@/modules/report/report.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────
// ReportService é stateless — agrega dados do ConsumptionRepository
// sem persistir nada. Depende dos repositórios de Property, Distributor,
// Area e Device apenas para validar a cadeia de posse.

const userRepository        = new UserRepository(prismaTest)
const userService           = new UserService(userRepository)

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService    = new DistributorService(distributorRepository)

const propertyRepository    = new PropertyRepository(prismaTest)
const propertyService       = new PropertyService(propertyRepository, distributorRepository)

const areaRepository        = new AreaRepository(prismaTest)
const areaService           = new AreaService(areaRepository, propertyRepository)

const deviceRepository      = new DeviceRepository(prismaTest)
const deviceService         = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const consumptionRepository = new ConsumptionRepository(prismaTest)
const consumptionService    = new ConsumptionService(
    consumptionRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
    distributorRepository,
)

const reportService = new ReportService(
    consumptionRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email:     "joao@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL" as const,
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const validUserB = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL" as const,
    firstName: "Maria",
    lastName:  "Santos",
    cpf:       "310.037.856-38",
}

// kwhPrice = 0.75 — facilita verificar: 10 kWh = R$ 7,50
const validDistributorInput = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage:   220,
    kwhPrice:         0.75,
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// Cria a cadeia completa user → distributor → property → area → device.
// Registros de consumo são criados diretamente nos testes — cada suite
// monta o cenário que precisa sem depender de dados pré-existentes.

async function setupAll(userInput = validUserA) {
    const user        = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property    = await propertyService.create(user.id, {
        name:          "Casa",
        distributorId: distributor.id,
    })
    const area   = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name:       "Ar-condicionado",
        powerWatts: 1000,
    })
    return { user, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanDatabase() })
afterAll(async ()  => { await prismaTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ReportService — target: PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportService — target: PROPERTY", () => {

    it("deve retornar relatório com summary correto para property com 3 registros MONTHLY", async () => {
        const { user, property } = await setupAll()

        // Cria 3 registros mensais com consumo crescente
        // Jan: 100 kWh, Fev: 150 kWh, Mar: 200 kWh
        await consumptionService.createForProperty(property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 100,
        })
        await consumptionService.createForProperty(property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-02-01", kwhConsumed: 150,
        })
        await consumptionService.createForProperty(property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-03-01", kwhConsumed: 200,
        })

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY",
            period: "MONTHLY",
        })

        // Estrutura geral
        expect(result.period).toBe("MONTHLY")
        expect(result.target).toEqual({ type: "PROPERTY", propertyId: property.id })
        expect(result.generatedAt).toBeInstanceOf(Date)
        expect(result.dateRange).toBeNull() // sem filtro de data

        // Summary: totalKwh = 100 + 150 + 200 = 450
        expect(result.summary.recordCount).toBe(3)
        expect(result.summary.totalKwh).toBeCloseTo(450)
        // totalCostBrl = 450 × 0,75 = 337,50
        expect(result.summary.totalCostBrl).toBeCloseTo(337.5)
        // avgKwhPerRecord = 450 / 3 = 150
        expect(result.summary.avgKwhPerRecord).toBeCloseTo(150)

        // Records são retornados ordenados por referenceDate desc
        expect(result.records).toHaveLength(3)
        expect(new Date(result.records[0]!.referenceDate) >= new Date(result.records[1]!.referenceDate)).toBe(true)
    })

    it("deve retornar summary zerado e records vazio quando não há registros", async () => {
        const { user, property } = await setupAll()

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY",
            period: "MONTHLY",
        })

        expect(result.summary.recordCount).toBe(0)
        expect(result.summary.totalKwh).toBe(0)
        expect(result.summary.totalCostBrl).toBe(0)
        expect(result.summary.avgKwhPerRecord).toBe(0)
        expect(result.summary.trend).toBe("INSUFFICIENT_DATA")
        expect(result.records).toHaveLength(0)
    })

    it("deve filtrar registros por dateFrom e dateTo", async () => {
        const { user, property } = await setupAll()

        // Cria 4 registros: Jan, Fev, Mar, Abr
        for (const [month, kwh] of [
            ["2025-01-01", 100],
            ["2025-02-01", 120],
            ["2025-03-01", 140],
            ["2025-04-01", 160],
        ] as const) {
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: month, kwhConsumed: kwh,
            })
        }

        // Filtra apenas Fev e Mar
        const result = await reportService.generate(property.id, user.id, {
            target:   "PROPERTY",
            period:   "MONTHLY",
            dateFrom: "2025-02-01",
            dateTo:   "2025-03-31",
        })

        expect(result.summary.recordCount).toBe(2)
        // 120 + 140 = 260 kWh
        expect(result.summary.totalKwh).toBeCloseTo(260)
        expect(result.dateRange).not.toBeNull()
        expect(result.dateRange?.from).toBeInstanceOf(Date)
        expect(result.dateRange?.to).toBeInstanceOf(Date)
    })

    it("deve retornar apenas registros do período (period) solicitado", async () => {
        const { user, property } = await setupAll()

        // Cria registros de diferentes periods — o relatório deve isolar por period
        await consumptionService.createForProperty(property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 200,
        })
        await consumptionService.createForProperty(property.id, user.id, {
            period: "ANNUAL", referenceDate: "2025-01-01", kwhConsumed: 3000,
        })

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY",
            period: "MONTHLY",
        })

        // Só deve incluir o registro MONTHLY
        expect(result.summary.recordCount).toBe(1)
        expect(result.summary.totalKwh).toBeCloseTo(200)
    })

    it("deve lançar ForbiddenError para property de outro usuário", async () => {
        const { property } = await setupAll(validUserA)
        const userB        = await userService.createUser(validUserB)

        await expect(
            reportService.generate(property.id, userB.id, {
                target: "PROPERTY",
                period: "MONTHLY",
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar NotFoundError para propertyId inexistente", async () => {
        const { user } = await setupAll()

        await expect(
            reportService.generate("00000000-0000-0000-0000-000000000000", user.id, {
                target: "PROPERTY",
                period: "MONTHLY",
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ValidationError para period inválido", async () => {
        const { user, property } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target: "PROPERTY",
                period: "WEEKLY" as unknown,
            }),
        ).rejects.toThrow(ValidationError)
    })

    it("deve lançar ValidationError para dateFrom inválido", async () => {
        const { user, property } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target:   "PROPERTY",
                period:   "MONTHLY",
                dateFrom: "nao-e-uma-data",
            }),
        ).rejects.toThrow(ValidationError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ReportService — target: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportService — target: AREA", () => {

    it("deve gerar relatório correto para uma área específica", async () => {
        const { user, property, area } = await setupAll()

        await consumptionService.createForArea(area.id, property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 80,
        })
        await consumptionService.createForArea(area.id, property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-02-01", kwhConsumed: 90,
        })

        const result = await reportService.generate(property.id, user.id, {
            target:   "AREA",
            targetId: area.id,
            period:   "MONTHLY",
        })

        expect(result.target).toEqual({
            type:       "AREA",
            propertyId: property.id,
            areaId:     area.id,
        })
        expect(result.summary.recordCount).toBe(2)
        // 80 + 90 = 170 kWh → 170 × 0,75 = R$ 127,50
        expect(result.summary.totalKwh).toBeCloseTo(170)
        expect(result.summary.totalCostBrl).toBeCloseTo(127.5)
    })

    it("deve lançar NotFoundError para areaId inexistente", async () => {
        const { user, property } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target:   "AREA",
                targetId: "00000000-0000-0000-0000-000000000000",
                period:   "MONTHLY",
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError quando area não pertence à property da URL", async () => {
        // Testa a mesma proteção de hierarquia que exists no consumption e simulation
        const { user, property } = await setupAll()
        const distributor2 = await distributorService.create(user.id, {
            ...validDistributorInput, cnpj: "11.222.333/0001-81",
        })
        const property2 = await propertyService.create(user.id, {
            name: "Escritório", distributorId: distributor2.id,
        })
        const area2 = await areaService.create(property2.id, user.id, { name: "Sala 2" })

        await expect(
            reportService.generate(property.id, user.id, {
                target:   "AREA",
                targetId: area2.id,
                period:   "MONTHLY",
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar ValidationError quando target=AREA sem targetId", async () => {
        const { user, property } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target: "AREA",
                // targetId ausente
                period: "MONTHLY",
            } as unknown),
        ).rejects.toThrow(ValidationError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ReportService — target: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportService — target: DEVICE", () => {

    it("deve gerar relatório correto para um device específico", async () => {
        const { user, property, area, device } = await setupAll()

        await consumptionService.createForDevice(device.id, area.id, property.id, user.id, {
            period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 8,
        })
        await consumptionService.createForDevice(device.id, area.id, property.id, user.id, {
            period: "DAILY", referenceDate: "2025-01-02", kwhConsumed: 10,
        })

        const result = await reportService.generate(property.id, user.id, {
            target:       "DEVICE",
            targetId:     device.id,
            targetAreaId: area.id,
            period:       "DAILY",
        })

        expect(result.target).toEqual({
            type:       "DEVICE",
            propertyId: property.id,
            areaId:     area.id,
            deviceId:   device.id,
        })
        expect(result.summary.recordCount).toBe(2)
        // 8 + 10 = 18 kWh → 18 × 0,75 = R$ 13,50
        expect(result.summary.totalKwh).toBeCloseTo(18)
        expect(result.summary.totalCostBrl).toBeCloseTo(13.5)
    })

    it("deve lançar NotFoundError para deviceId inexistente", async () => {
        const { user, property, area } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target:       "DEVICE",
                targetId:     "00000000-0000-0000-0000-000000000000",
                targetAreaId: area.id,
                period:       "DAILY",
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError quando device não pertence à area informada", async () => {
        const { user, property, device } = await setupAll()
        const area2 = await areaService.create(property.id, user.id, { name: "Quarto" })

        await expect(
            reportService.generate(property.id, user.id, {
                target:       "DEVICE",
                targetId:     device.id,
                targetAreaId: area2.id, // área errada
                period:       "DAILY",
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar ValidationError quando target=DEVICE sem targetAreaId", async () => {
        const { user, property, device } = await setupAll()

        await expect(
            reportService.generate(property.id, user.id, {
                target:   "DEVICE",
                targetId: device.id,
                // targetAreaId ausente
                period:   "DAILY",
            } as unknown),
        ).rejects.toThrow(ValidationError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ReportService — cálculo de tendência (trend)
// ─────────────────────────────────────────────────────────────────────────────
// Estes testes focam exclusivamente na lógica de tendência,
// que é a parte mais "matemática" do módulo.
// Analogia: é como testar a régua separada do que você vai medir.

describe("ReportService — cálculo de tendência", () => {

    it("deve retornar INSUFFICIENT_DATA com menos de 2 registros", async () => {
        const { user, property } = await setupAll()

        await consumptionService.createForProperty(property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 100,
        })

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("INSUFFICIENT_DATA")
    })

    it("deve retornar INSUFFICIENT_DATA com 0 registros", async () => {
        const { user, property } = await setupAll()

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("INSUFFICIENT_DATA")
    })

    it("deve retornar INCREASING quando segunda metade consome mais de 5% acima da primeira", async () => {
        const { user, property } = await setupAll()

        // Primeira metade: Jan(100) + Fev(100) → média 100
        // Segunda metade:  Mar(120) + Abr(120) → média 120
        // Variação: +20% → INCREASING
        for (const [month, kwh] of [
            ["2025-01-01", 100],
            ["2025-02-01", 100],
            ["2025-03-01", 120],
            ["2025-04-01", 120],
        ] as const) {
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: month, kwhConsumed: kwh,
            })
        }

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("INCREASING")
    })

    it("deve retornar DECREASING quando segunda metade consome mais de 5% abaixo da primeira", async () => {
        const { user, property } = await setupAll()

        // Primeira metade: Jan(120) + Fev(120) → média 120
        // Segunda metade:  Mar(100) + Abr(100) → média 100
        // Variação: -16,7% → DECREASING
        for (const [month, kwh] of [
            ["2025-01-01", 120],
            ["2025-02-01", 120],
            ["2025-03-01", 100],
            ["2025-04-01", 100],
        ] as const) {
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: month, kwhConsumed: kwh,
            })
        }

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("DECREASING")
    })

    it("deve retornar STABLE quando variação é menor que 5%", async () => {
        const { user, property } = await setupAll()

        // Primeira metade: 100 + 100 → média 100
        // Segunda metade:  102 + 102 → média 102
        // Variação: +2% → STABLE (abaixo do threshold de 5%)
        for (const [month, kwh] of [
            ["2025-01-01", 100],
            ["2025-02-01", 100],
            ["2025-03-01", 102],
            ["2025-04-01", 102],
        ] as const) {
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: month, kwhConsumed: kwh,
            })
        }

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("STABLE")
    })

    it("deve calcular tendência corretamente com número ímpar de registros", async () => {
        const { user, property } = await setupAll()

        // 3 registros: primeira metade = [100], segunda metade = [120, 130]
        // floor(3/2) = 1 → primeira metade: índice 0 (100), segunda: índices 1 e 2 (120, 130)
        // média primeira = 100, média segunda = 125
        // variação = +25% → INCREASING
        for (const [month, kwh] of [
            ["2025-01-01", 100],
            ["2025-02-01", 120],
            ["2025-03-01", 130],
        ] as const) {
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: month, kwhConsumed: kwh,
            })
        }

        const result = await reportService.generate(property.id, user.id, {
            target: "PROPERTY", period: "MONTHLY",
        })

        expect(result.summary.trend).toBe("INCREASING")
    })
})