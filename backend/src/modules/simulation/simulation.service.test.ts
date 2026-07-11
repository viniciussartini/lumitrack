import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { SimulationService } from "@/modules/simulation/simulation.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor, createTestTariffFlagConfig } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────
// SimulationService é stateless — não possui repositório próprio. Ele depende
// dos repositórios de Property, Distributor, Area, Device e TariffFlag para
// validar a cadeia de posse e calcular o custo via TariffService (Fase 3 —
// substituiu o antigo kwhPrice fixo da distribuidora).

const userRepository        = new UserRepository(prismaTest)
const userService           = new UserService(userRepository)

const distributorRepository = new DistributorRepository(prismaTest)

const propertyRepository    = new PropertyRepository(prismaTest)
const propertyService       = new PropertyService(propertyRepository, distributorRepository)

const areaRepository        = new AreaRepository(prismaTest)
const areaService           = new AreaService(areaRepository, propertyRepository)

const deviceRepository      = new DeviceRepository(prismaTest)
const deviceService         = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const tariffFlagRepository  = new TariffFlagRepository(prismaTest)

const simulationService     = new SimulationService(
    propertyRepository,
    distributorRepository,
    areaRepository,
    deviceRepository,
    tariffFlagRepository,
)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email:     "joao@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const validUserB = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "Maria",
    lastName:  "Santos",
    cpf:       "310.037.856-38",
}

// tusdPerKwh=0.3 + tePerKwh=0.3 = 0.6 R$/kWh; tributos 27,25%
// (18% ICMS + 1,65% PIS + 7,6% COFINS); bandeira GREEN = 0. Cálculo "por
// dentro": custo = kWh × 0,6 / (1 − 0,2725) — mesma fórmula em todos os
// testes abaixo, via a constante RATE.
const RATE = 0.6 / (1 - 0.2725)

// ─── Helper ───────────────────────────────────────────────────────────────────
// Monta a cadeia completa: user → distributor (catálogo) → property → area
// → device. `powerWatts` no device é 1000W para facilitar a matemática:
//   1000W × N horas = N kWh (sem divisão por 1000 na cabeça).
// Área/dispositivo não têm piso de disponibilidade nem CIP — só a
// propriedade em MONTHLY/ANNUAL tem.

async function setupAll(userInput = validUserA) {
    const user        = await userService.createUser(userInput)
    const distributor  = await createTestDistributor(prismaTest)
    await createTestTariffFlagConfig(prismaTest)
    const property    = await propertyService.create(user.id, {
        name:             "Casa",
        distributorId:    distributor.id,
        electricalSystem: "TRIPHASIC", // piso de 100 kWh
    })
    const area   = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name:       "Ar-condicionado",
        powerWatts: 1000, // 1000W → 1 kWh por hora de uso
    })
    return { user, distributor, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanDatabase() })
afterAll(async ()  => { await prismaTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: SimulationService — target: PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

describe("SimulationService — target: PROPERTY", () => {

    // ─── Modo KWH_DIRECT ─────────────────────────────────────────────────────

    describe("inputMode: KWH_DIRECT", () => {
        it("deve calcular simulação DAILY para property com kWh direto (sem piso — não é o mês inteiro)", async () => {
            const { user, property } = await setupAll()

            const result = await simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            })

            expect(result.period).toBe("DAILY")
            expect(result.target).toEqual({ type: "PROPERTY" })
            expect(result.inputMode).toBe("KWH_DIRECT")
            expect(result.kwhConsumed).toBe(10)
            expect(result.costBrl).toBeCloseTo(10 * RATE, 6)
            expect(result.projectedDays).toBe(1)
            expect(result.powerWatts).toBeNull()
            expect(result.dailyUsageHours).toBeNull()
        })

        it("deve calcular simulação MONTHLY para property acima do piso (100 kWh, TRIPHASIC)", async () => {
            const { user, property } = await setupAll()

            const result = await simulationService.simulate(property.id, user.id, {
                period:      "MONTHLY",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 300,
            })

            expect(result.kwhConsumed).toBe(300)
            expect(result.costBrl).toBeCloseTo(300 * RATE, 6)
            expect(result.projectedDays).toBe(30)
        })

        it("deve aplicar o piso de disponibilidade na MONTHLY quando o consumo fica abaixo dele", async () => {
            const { user, property } = await setupAll()

            // 10 kWh/dia × 1 dia direto não é o caso aqui — kwhConsumed é o
            // total do mês em KWH_DIRECT; 50 kWh < piso de 100 (TRIPHASIC).
            const result = await simulationService.simulate(property.id, user.id, {
                period:      "MONTHLY",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 50,
            })

            // Custo cobrado como se fossem 100 kWh (piso), não 50.
            expect(result.costBrl).toBeCloseTo(100 * RATE, 6)
        })

        it("deve calcular simulação ANNUAL para property (acima do piso mensal médio)", async () => {
            const { user, property } = await setupAll()

            const result = await simulationService.simulate(property.id, user.id, {
                period:      "ANNUAL",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 3650,
            })

            expect(result.kwhConsumed).toBe(3650)
            expect(result.costBrl).toBeCloseTo(3650 * RATE, 6)
            expect(result.projectedDays).toBe(365)
        })
    })

    // ─── Modo WATTS_HOURS ─────────────────────────────────────────────────────

    describe("inputMode: WATTS_HOURS", () => {
        it("deve calcular simulação DAILY com watts + horas para property", async () => {
            const { user, property } = await setupAll()

            // 2000W × 5h = 10 kWh/dia
            const result = await simulationService.simulate(property.id, user.id, {
                period:          "DAILY",
                target:          { type: "PROPERTY" },
                inputMode:       "WATTS_HOURS",
                powerWatts:      2000,
                dailyUsageHours: 5,
            })

            expect(result.inputMode).toBe("WATTS_HOURS")
            expect(result.powerWatts).toBe(2000)
            expect(result.dailyUsageHours).toBe(5)
            expect(result.kwhConsumed).toBeCloseTo(10)    // (2000/1000) × 5 × 1
            expect(result.costBrl).toBeCloseTo(10 * RATE, 6)
            expect(result.projectedDays).toBe(1)
        })

        it("deve calcular simulação MONTHLY com watts + horas — projectedDays = 30", async () => {
            const { user, property } = await setupAll()

            // 1000W × 4h × 30 dias = 120 kWh
            const result = await simulationService.simulate(property.id, user.id, {
                period:          "MONTHLY",
                target:          { type: "PROPERTY" },
                inputMode:       "WATTS_HOURS",
                powerWatts:      1000,
                dailyUsageHours: 4,
            })

            expect(result.kwhConsumed).toBeCloseTo(120)
            expect(result.costBrl).toBeCloseTo(120 * RATE, 6)
            expect(result.projectedDays).toBe(30)
        })

        it("deve calcular simulação ANNUAL com watts + horas — projectedDays = 365", async () => {
            const { user, property } = await setupAll()

            // 2000W × 2h × 365 dias = 1460 kWh — média mensal de ~121,7 kWh,
            // acima do piso de 100 (TRIPHASIC), então o piso não interfere.
            const result = await simulationService.simulate(property.id, user.id, {
                period:          "ANNUAL",
                target:          { type: "PROPERTY" },
                inputMode:       "WATTS_HOURS",
                powerWatts:      2000,
                dailyUsageHours: 2,
            })

            expect(result.kwhConsumed).toBeCloseTo(1460)
            expect(result.costBrl).toBeCloseTo(1460 * RATE, 6)
            expect(result.projectedDays).toBe(365)
        })
    })

    // ─── Erros ────────────────────────────────────────────────────────────────

    describe("erros", () => {
        it("deve lançar ForbiddenError para property de outro usuário", async () => {
            const { property } = await setupAll(validUserA)
            const userB        = await userService.createUser(validUserB)

            await expect(
                simulationService.simulate(property.id, userB.id, {
                    period:      "DAILY",
                    target:      { type: "PROPERTY" },
                    inputMode:   "KWH_DIRECT",
                    kwhConsumed: 10,
                }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar NotFoundError para propertyId inexistente", async () => {
            const { user } = await setupAll()

            await expect(
                simulationService.simulate("00000000-0000-0000-0000-000000000000", user.id, {
                    period:      "DAILY",
                    target:      { type: "PROPERTY" },
                    inputMode:   "KWH_DIRECT",
                    kwhConsumed: 10,
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ValidationError para kwhConsumed negativo", async () => {
            const { user, property } = await setupAll()

            await expect(
                simulationService.simulate(property.id, user.id, {
                    period:      "DAILY",
                    target:      { type: "PROPERTY" },
                    inputMode:   "KWH_DIRECT",
                    kwhConsumed: -5,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para dailyUsageHours acima de 24", async () => {
            const { user, property } = await setupAll()

            await expect(
                simulationService.simulate(property.id, user.id, {
                    period:          "DAILY",
                    target:          { type: "PROPERTY" },
                    inputMode:       "WATTS_HOURS",
                    powerWatts:      1000,
                    dailyUsageHours: 25,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para inputMode WATTS_HOURS sem dailyUsageHours", async () => {
            const { user, property } = await setupAll()

            await expect(
                simulationService.simulate(property.id, user.id, {
                    period:     "DAILY",
                    target:     { type: "PROPERTY" },
                    inputMode:  "WATTS_HOURS",
                    powerWatts: 1000,
                    // dailyUsageHours ausente
                } as unknown),
            ).rejects.toThrow(ValidationError)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: SimulationService — target: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("SimulationService — target: AREA", () => {

    it("deve calcular simulação DAILY para area com kWh direto (sem piso/CIP)", async () => {
        const { user, property, area } = await setupAll()

        const result = await simulationService.simulate(property.id, user.id, {
            period:      "DAILY",
            target:      { type: "AREA", areaId: area.id },
            inputMode:   "KWH_DIRECT",
            kwhConsumed: 5,
        })

        expect(result.target).toEqual({ type: "AREA", areaId: area.id })
        expect(result.kwhConsumed).toBe(5)
        expect(result.costBrl).toBeCloseTo(5 * RATE, 6)
    })

    it("deve calcular simulação MONTHLY para area sem aplicar o piso da propriedade", async () => {
        const { user, property, area } = await setupAll()

        // 800W × 3h × 30 dias = 72 kWh — abaixo do piso de 100 kWh, mas o
        // piso não se aplica a AREA/DEVICE.
        const result = await simulationService.simulate(property.id, user.id, {
            period:          "MONTHLY",
            target:          { type: "AREA", areaId: area.id },
            inputMode:       "WATTS_HOURS",
            powerWatts:      800,
            dailyUsageHours: 3,
        })

        expect(result.kwhConsumed).toBeCloseTo(72)
        expect(result.costBrl).toBeCloseTo(72 * RATE, 6)
    })

    it("deve lançar ForbiddenError para area de outro usuário", async () => {
        const { property, area } = await setupAll(validUserA)
        const userB              = await userService.createUser(validUserB)

        await expect(
            simulationService.simulate(property.id, userB.id, {
                period:      "DAILY",
                target:      { type: "AREA", areaId: area.id },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar NotFoundError para areaId inexistente", async () => {
        const { user, property } = await setupAll()

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "AREA", areaId: "00000000-0000-0000-0000-000000000000" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError quando area não pertence à property da URL", async () => {
        // Cenário: usuário tenta simular com área válida mas de outra propriedade sua.
        const { user, property, distributor } = await setupAll()
        const property2 = await propertyService.create(user.id, {
            name:             "Escritório",
            distributorId:    distributor.id,
            electricalSystem: "TRIPHASIC",
        })
        const area2 = await areaService.create(property2.id, user.id, { name: "Sala 2" })

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "AREA", areaId: area2.id },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(ForbiddenError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: SimulationService — target: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("SimulationService — target: DEVICE", () => {

    // ─── Modo KWH_DIRECT ─────────────────────────────────────────────────────

    it("deve calcular simulação DAILY para device com kWh direto", async () => {
        const { user, property, area, device } = await setupAll()

        const result = await simulationService.simulate(property.id, user.id, {
            period:      "DAILY",
            target:      { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:   "KWH_DIRECT",
            kwhConsumed: 8,
        })

        expect(result.target).toEqual({ type: "DEVICE", deviceId: device.id, areaId: area.id })
        expect(result.kwhConsumed).toBe(8)
        expect(result.costBrl).toBeCloseTo(8 * RATE, 6)
    })

    // ─── Modo WATTS_HOURS com powerWatts explícito ────────────────────────────

    it("deve calcular simulação MONTHLY para device com watts + horas (powerWatts explícito)", async () => {
        const { user, property, area, device } = await setupAll()

        // 500W × 6h × 30 dias = 90 kWh
        const result = await simulationService.simulate(property.id, user.id, {
            period:          "MONTHLY",
            target:          { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:       "WATTS_HOURS",
            powerWatts:      500,
            dailyUsageHours: 6,
        })

        expect(result.powerWatts).toBe(500)
        expect(result.kwhConsumed).toBeCloseTo(90)
        expect(result.costBrl).toBeCloseTo(90 * RATE, 6)
    })

    // ─── Modo WATTS_HOURS usando powerWatts do cadastro ──────────────────────

    it("deve usar powerWatts do device cadastrado quando não informado no body (WATTS_HOURS)", async () => {
        const { user, property, area, device } = await setupAll()
        // device.powerWatts = 1000W (definido no helper setupAll)

        const result = await simulationService.simulate(property.id, user.id, {
            period:          "DAILY",
            target:          { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:       "WATTS_HOURS",
            // powerWatts omitido → service usa device.powerWatts = 1000
            dailyUsageHours: 8,
        })

        expect(result.powerWatts).toBe(1000) // vindo do cadastro
        expect(result.kwhConsumed).toBeCloseTo(8)
        expect(result.costBrl).toBeCloseTo(8 * RATE, 6)
    })

    it("deve lançar ValidationError ao omitir powerWatts para device sem powerWatts cadastrado", async () => {
        const { user, property, area } = await setupAll()
        const deviceSemWatts = await deviceService.create(area.id, property.id, user.id, {
            name: "Dispositivo sem watts",
        })

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:          "DAILY",
                target:          { type: "DEVICE", deviceId: deviceSemWatts.id, areaId: area.id },
                inputMode:       "WATTS_HOURS",
                dailyUsageHours: 8,
            }),
        ).rejects.toThrow(ValidationError)
    })

    it("deve lançar ForbiddenError para device de outro usuário", async () => {
        const { property, area, device } = await setupAll(validUserA)
        const userB                      = await userService.createUser(validUserB)

        await expect(
            simulationService.simulate(property.id, userB.id, {
                period:      "DAILY",
                target:      { type: "DEVICE", deviceId: device.id, areaId: area.id },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar NotFoundError para deviceId inexistente", async () => {
        const { user, property, area } = await setupAll()

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "DEVICE", deviceId: "00000000-0000-0000-0000-000000000000", areaId: area.id },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError quando device não pertence à area informada", async () => {
        const { user, property, device } = await setupAll()
        const area2 = await areaService.create(property.id, user.id, { name: "Quarto" })

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "DEVICE", deviceId: device.id, areaId: area2.id },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 10,
            }),
        ).rejects.toThrow(ForbiddenError)
    })
})
