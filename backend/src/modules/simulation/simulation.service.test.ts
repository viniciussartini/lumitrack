import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { SimulationService } from "@/modules/simulation/simulation.service.js"
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
// SimulationService é stateless — não possui repositório próprio.
// Ele depende dos repositórios de Property, Distributor, Area e Device
// para validar a cadeia de posse e buscar kwhPrice e powerWatts.
//
// Analogia: a simulação é como uma calculadora de imposto de renda.
// Ela não armazena nada — apenas recebe os dados, faz os cálculos e devolve
// o resultado. Os repositórios são as "fontes de dados" que ela consulta.

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

const simulationService     = new SimulationService(
    propertyRepository,
    distributorRepository,
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

// kwhPrice = 0.75 — usado para conferir todos os cálculos de costBrl
const validDistributorInput = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage:   220,
    kwhPrice:         0.75,
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// Monta a cadeia completa: user → distributor → property → area → device.
// `powerWatts` no device é 1000W para facilitar a matemática:
//   1000W × N horas = N kWh (sem divisão por 1000 na cabeça).

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
        it("deve calcular simulação DAILY para property com kWh direto", async () => {
            const { user, property } = await setupAll()

            // 10 kWh × R$ 0,75 = R$ 7,50
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
            expect(result.costBrl).toBeCloseTo(7.5)
            expect(result.kwhPrice).toBe(0.75)
            expect(result.projectedDays).toBe(1)
            expect(result.powerWatts).toBeNull()
            expect(result.dailyUsageHours).toBeNull()
        })

        it("deve calcular simulação MONTHLY para property — projectedDays = 30", async () => {
            const { user, property } = await setupAll()

            // 300 kWh × R$ 0,75 = R$ 225,00
            const result = await simulationService.simulate(property.id, user.id, {
                period:      "MONTHLY",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 300,
            })

            expect(result.kwhConsumed).toBe(300)
            expect(result.costBrl).toBeCloseTo(225)
            expect(result.projectedDays).toBe(30)
        })

        it("deve calcular simulação ANNUAL para property — projectedDays = 365", async () => {
            const { user, property } = await setupAll()

            // 3650 kWh × R$ 0,75 = R$ 2737,50
            const result = await simulationService.simulate(property.id, user.id, {
                period:      "ANNUAL",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 3650,
            })

            expect(result.kwhConsumed).toBe(3650)
            expect(result.costBrl).toBeCloseTo(2737.5)
            expect(result.projectedDays).toBe(365)
        })

        it("deve usar o kwhPrice da distribuidora vinculada à property", async () => {
            // Verifica que o snapshot do kwhPrice no resultado vem da distribuidora correta
            const { user, property } = await setupAll()

            const result = await simulationService.simulate(property.id, user.id, {
                period:      "DAILY",
                target:      { type: "PROPERTY" },
                inputMode:   "KWH_DIRECT",
                kwhConsumed: 1,
            })

            expect(result.kwhPrice).toBe(0.75)
        })
    })

    // ─── Modo WATTS_HOURS ─────────────────────────────────────────────────────

    describe("inputMode: WATTS_HOURS", () => {
        it("deve calcular simulação DAILY com watts + horas para property", async () => {
            const { user, property } = await setupAll()

            // 2000W × 5h = 10 kWh/dia → DAILY: 10 kWh × 0,75 = R$ 7,50
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
            expect(result.costBrl).toBeCloseTo(7.5)
            expect(result.projectedDays).toBe(1)
        })

        it("deve calcular simulação MONTHLY com watts + horas — projectedDays = 30", async () => {
            const { user, property } = await setupAll()

            // 1000W × 4h × 30 dias = 120 kWh → 120 × 0,75 = R$ 90,00
            const result = await simulationService.simulate(property.id, user.id, {
                period:          "MONTHLY",
                target:          { type: "PROPERTY" },
                inputMode:       "WATTS_HOURS",
                powerWatts:      1000,
                dailyUsageHours: 4,
            })

            expect(result.kwhConsumed).toBeCloseTo(120)
            expect(result.costBrl).toBeCloseTo(90)
            expect(result.projectedDays).toBe(30)
        })

        it("deve calcular simulação ANNUAL com watts + horas — projectedDays = 365", async () => {
            const { user, property } = await setupAll()

            // 500W × 2h × 365 dias = 365 kWh → 365 × 0,75 = R$ 273,75
            const result = await simulationService.simulate(property.id, user.id, {
                period:          "ANNUAL",
                target:          { type: "PROPERTY" },
                inputMode:       "WATTS_HOURS",
                powerWatts:      500,
                dailyUsageHours: 2,
            })

            expect(result.kwhConsumed).toBeCloseTo(365)
            expect(result.costBrl).toBeCloseTo(273.75)
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

    it("deve calcular simulação DAILY para area com kWh direto", async () => {
        const { user, property, area } = await setupAll()

        // 5 kWh × 0,75 = R$ 3,75
        const result = await simulationService.simulate(property.id, user.id, {
            period:      "DAILY",
            target:      { type: "AREA", areaId: area.id },
            inputMode:   "KWH_DIRECT",
            kwhConsumed: 5,
        })

        expect(result.target).toEqual({ type: "AREA", areaId: area.id })
        expect(result.kwhConsumed).toBe(5)
        expect(result.costBrl).toBeCloseTo(3.75)
    })

    it("deve calcular simulação MONTHLY para area com watts + horas", async () => {
        const { user, property, area } = await setupAll()

        // 800W × 3h × 30 dias = 72 kWh → 72 × 0,75 = R$ 54,00
        const result = await simulationService.simulate(property.id, user.id, {
            period:          "MONTHLY",
            target:          { type: "AREA", areaId: area.id },
            inputMode:       "WATTS_HOURS",
            powerWatts:      800,
            dailyUsageHours: 3,
        })

        expect(result.kwhConsumed).toBeCloseTo(72)
        expect(result.costBrl).toBeCloseTo(54)
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
        // Isso detecta tentativa de misturar hierarquias.
        const { user, property } = await setupAll()
        const property2 = await propertyService.create(user.id, {
            name:          "Escritório",
            distributorId: (await distributorService.create(user.id, {
                ...validDistributorInput,
                cnpj: "11.222.333/0001-81",
            })).id,
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

        // 8 kWh × 0,75 = R$ 6,00
        const result = await simulationService.simulate(property.id, user.id, {
            period:      "DAILY",
            target:      { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:   "KWH_DIRECT",
            kwhConsumed: 8,
        })

        expect(result.target).toEqual({ type: "DEVICE", deviceId: device.id, areaId: area.id })
        expect(result.kwhConsumed).toBe(8)
        expect(result.costBrl).toBeCloseTo(6)
    })

    // ─── Modo WATTS_HOURS com powerWatts explícito ────────────────────────────

    it("deve calcular simulação MONTHLY para device com watts + horas (powerWatts explícito)", async () => {
        const { user, property, area, device } = await setupAll()

        // 500W × 6h × 30 dias = 90 kWh → 90 × 0,75 = R$ 67,50
        const result = await simulationService.simulate(property.id, user.id, {
            period:          "MONTHLY",
            target:          { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:       "WATTS_HOURS",
            powerWatts:      500,
            dailyUsageHours: 6,
        })

        expect(result.powerWatts).toBe(500)
        expect(result.kwhConsumed).toBeCloseTo(90)
        expect(result.costBrl).toBeCloseTo(67.5)
    })

    // ─── Modo WATTS_HOURS usando powerWatts do cadastro ──────────────────────

    it("deve usar powerWatts do device cadastrado quando não informado no body (WATTS_HOURS)", async () => {
        const { user, property, area, device } = await setupAll()
        // device.powerWatts = 1000W (definido no helper setupAll)

        // 1000W × 8h × 1 dia = 8 kWh → 8 × 0,75 = R$ 6,00
        const result = await simulationService.simulate(property.id, user.id, {
            period:          "DAILY",
            target:          { type: "DEVICE", deviceId: device.id, areaId: area.id },
            inputMode:       "WATTS_HOURS",
            // powerWatts omitido → service usa device.powerWatts = 1000
            dailyUsageHours: 8,
        })

        expect(result.powerWatts).toBe(1000) // vindo do cadastro
        expect(result.kwhConsumed).toBeCloseTo(8)
        expect(result.costBrl).toBeCloseTo(6)
    })

    it("deve lançar ValidationError ao omitir powerWatts para device sem powerWatts cadastrado", async () => {
        // Device sem powerWatts cadastrado + body sem powerWatts → impossível calcular
        const { user, property, area } = await setupAll()
        const deviceSemWatts = await deviceService.create(area.id, property.id, user.id, {
            name: "Dispositivo sem watts",
            // powerWatts não informado
        })

        await expect(
            simulationService.simulate(property.id, user.id, {
                period:          "DAILY",
                target:          { type: "DEVICE", deviceId: deviceSemWatts.id, areaId: area.id },
                inputMode:       "WATTS_HOURS",
                // powerWatts ausente no body E no cadastro
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
        // Cenário: device real, mas areaId errado — cadeia de posse inválida.
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