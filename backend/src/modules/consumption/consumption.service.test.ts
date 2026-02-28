import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)

const deviceRepository = new DeviceRepository(prismaTest)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const consumptionRepository = new ConsumptionRepository(prismaTest)
const consumptionService = new ConsumptionService(
    consumptionRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
    distributorRepository,
)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const validUserB = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

// kwhPrice = 0.75 → usado para verificar cálculo automático de costBrl
const validDistributorInput = {
    name: "CEMIG",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage: 220,
    kwhPrice: 0.75,
}

const baseConsumptionInput = {
    period: "DAILY" as const,
    referenceDate: "2025-01-15",
    kwhConsumed: 10,
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function setupAll(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
    })
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name: "Ar-condicionado",
        powerWatts: 1200,
    })
    return { user, distributor, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ConsumptionService — target: PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionService — target: property", () => {

    describe("create", () => {
        it("deve criar registro de consumo para uma propriedade e calcular costBrl automaticamente", async () => {
            const { user, property } = await setupAll()

            const record = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )

            expect(record.id).toBeDefined()
            expect(record.propertyId).toBe(property.id)
            expect(record.kwhConsumed).toBe(10)
            // costBrl = 10 kWh × R$0,75 = R$7,50
            expect(record.costBrl).toBeCloseTo(7.5)
            expect(record.areaId).toBeNull()
            expect(record.deviceId).toBeNull()
        })

        it("deve criar registro com notes", async () => {
            const { user, property } = await setupAll()

            const record = await consumptionService.createForProperty(
                property.id, user.id, { ...baseConsumptionInput, notes: "Mês com pico de calor" },
            )

            expect(record.notes).toBe("Mês com pico de calor")
        })

        it("deve lançar ConflictError para period + property + referenceDate duplicados", async () => {
            const { user, property } = await setupAll()
            await consumptionService.createForProperty(property.id, user.id, baseConsumptionInput)

            await expect(
                consumptionService.createForProperty(property.id, user.id, baseConsumptionInput),
            ).rejects.toThrow(ConflictError)
        })

        it("deve lançar NotFoundError para propertyId inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                consumptionService.createForProperty(
                    "00000000-0000-0000-0000-000000000000", user.id, baseConsumptionInput,
                ),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError para propriedade de outro usuário", async () => {
            const { property } = await setupAll(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                consumptionService.createForProperty(property.id, userB.id, baseConsumptionInput),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para kwhConsumed zero ou negativo", async () => {
            const { user, property } = await setupAll()

            await expect(
                consumptionService.createForProperty(
                    property.id, user.id, { ...baseConsumptionInput, kwhConsumed: 0 },
                ),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para referenceDate inválida", async () => {
            const { user, property } = await setupAll()

            await expect(
                consumptionService.createForProperty(
                    property.id, user.id, { ...baseConsumptionInput, referenceDate: "nao-e-data" },
                ),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("findAll", () => {
        it("deve retornar todos os registros da propriedade ordenados por referenceDate desc", async () => {
            const { user, property } = await setupAll()
            await consumptionService.createForProperty(property.id, user.id, {
                ...baseConsumptionInput, referenceDate: "2025-01-01",
            })
            await consumptionService.createForProperty(property.id, user.id, {
                ...baseConsumptionInput, referenceDate: "2025-01-02",
            })

            const list = await consumptionService.findAllForProperty(property.id, user.id, {})

            expect(list).toHaveLength(2)
            expect(new Date(list[0]!.referenceDate) > new Date(list[1]!.referenceDate)).toBe(true)
        })

        it("deve filtrar por period quando informado", async () => {
            const { user, property } = await setupAll()
            await consumptionService.createForProperty(property.id, user.id, {
                period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 5,
            })
            await consumptionService.createForProperty(property.id, user.id, {
                period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 150,
            })

            const daily = await consumptionService.findAllForProperty(property.id, user.id, { period: "DAILY" })
            expect(daily).toHaveLength(1)
            expect(daily[0]?.period).toBe("DAILY")
        })

        it("deve lançar ForbiddenError ao listar consumo de propriedade de outro usuário", async () => {
            const { property } = await setupAll(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                consumptionService.findAllForProperty(property.id, userB.id, {}),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("findById", () => {
        it("deve retornar o registro pelo id", async () => {
            const { user, property } = await setupAll()
            const created = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )

            const found = await consumptionService.findById(created.id, property.id, user.id)

            expect(found.id).toBe(created.id)
        })

        it("deve lançar NotFoundError para id inexistente", async () => {
            const { user, property } = await setupAll()

            await expect(
                consumptionService.findById("00000000-0000-0000-0000-000000000000", property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError para propriedade de outro usuário", async () => {
            const { property } = await setupAll(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                consumptionService.findById("00000000-0000-0000-0000-000000000000", property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("update", () => {
        it("deve atualizar kwhConsumed e recalcular costBrl automaticamente", async () => {
            const { user, property } = await setupAll()
            const record = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )

            // kwhConsumed de 10 → 20; costBrl esperado: 20 × 0,75 = 15,00
            const updated = await consumptionService.update(
                record.id, property.id, user.id, { kwhConsumed: 20 },
            )

            expect(updated.kwhConsumed).toBe(20)
            expect(updated.costBrl).toBeCloseTo(15)
        })

        it("deve atualizar apenas notes sem recalcular costBrl", async () => {
            const { user, property } = await setupAll()
            const record = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )
            const originalCost = record.costBrl

            const updated = await consumptionService.update(
                record.id, property.id, user.id, { notes: "Atualizado" },
            )

            expect(updated.notes).toBe("Atualizado")
            expect(updated.costBrl).toBe(originalCost)
        })

        it("deve lançar NotFoundError para id inexistente", async () => {
            const { user, property } = await setupAll()

            await expect(
                consumptionService.update(
                    "00000000-0000-0000-0000-000000000000", property.id, user.id, { notes: "X" },
                ),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ValidationError para kwhConsumed negativo na atualização", async () => {
            const { user, property } = await setupAll()
            const record = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )

            await expect(
                consumptionService.update(record.id, property.id, user.id, { kwhConsumed: -5 }),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("delete", () => {
        it("deve deletar um registro de consumo", async () => {
            const { user, property } = await setupAll()
            const record = await consumptionService.createForProperty(
                property.id, user.id, baseConsumptionInput,
            )

            await consumptionService.delete(record.id, property.id, user.id)

            await expect(
                consumptionService.findById(record.id, property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao deletar consumo de propriedade de outro usuário", async () => {
            const { property } = await setupAll(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                consumptionService.delete("00000000-0000-0000-0000-000000000000", property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ConsumptionService — target: AREA
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionService — target: area", () => {
    it("deve criar registro para área e calcular costBrl via distribuidora da propriedade pai", async () => {
        const { user, property, area } = await setupAll()

        const record = await consumptionService.createForArea(
            area.id, property.id, user.id, baseConsumptionInput,
        )

        expect(record.areaId).toBe(area.id)
        expect(record.propertyId).toBeNull()
        // costBrl calculado via distribuidora da property pai
        expect(record.costBrl).toBeCloseTo(7.5)
    })

    it("deve lançar ConflictError para period + area + referenceDate duplicados", async () => {
        const { user, property, area } = await setupAll()
        await consumptionService.createForArea(area.id, property.id, user.id, baseConsumptionInput)

        await expect(
            consumptionService.createForArea(area.id, property.id, user.id, baseConsumptionInput),
        ).rejects.toThrow(ConflictError)
    })

    it("deve lançar ForbiddenError para área de outro usuário", async () => {
        const { property, area } = await setupAll(validUserA)
        const userB = await userService.createUser(validUserB)

        await expect(
            consumptionService.createForArea(area.id, property.id, userB.id, baseConsumptionInput),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve filtrar registros da área por period", async () => {
        const { user, property, area } = await setupAll()
        await consumptionService.createForArea(area.id, property.id, user.id, {
            period: "DAILY", referenceDate: "2025-01-01", kwhConsumed: 5,
        })
        await consumptionService.createForArea(area.id, property.id, user.id, {
            period: "MONTHLY", referenceDate: "2025-01-01", kwhConsumed: 150,
        })

        const list = await consumptionService.findAllForArea(area.id, property.id, user.id, { period: "MONTHLY" })

        expect(list).toHaveLength(1)
        expect(list[0]?.period).toBe("MONTHLY")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: ConsumptionService — target: DEVICE
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionService — target: device", () => {
    it("deve criar registro para device e calcular costBrl via distribuidora da propriedade pai", async () => {
        const { user, property, area, device } = await setupAll()

        const record = await consumptionService.createForDevice(
            device.id, area.id, property.id, user.id, baseConsumptionInput,
        )

        expect(record.deviceId).toBe(device.id)
        expect(record.propertyId).toBeNull()
        expect(record.areaId).toBeNull()
        expect(record.costBrl).toBeCloseTo(7.5)
    })

    it("deve lançar ConflictError para period + device + referenceDate duplicados", async () => {
        const { user, property, area, device } = await setupAll()
        await consumptionService.createForDevice(device.id, area.id, property.id, user.id, baseConsumptionInput)

        await expect(
            consumptionService.createForDevice(device.id, area.id, property.id, user.id, baseConsumptionInput),
        ).rejects.toThrow(ConflictError)
    })

    it("deve lançar ForbiddenError para device de outro usuário", async () => {
        const { property, area, device } = await setupAll(validUserA)
        const userB = await userService.createUser(validUserB)

        await expect(
            consumptionService.createForDevice(device.id, area.id, property.id, userB.id, baseConsumptionInput),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve retornar lista vazia quando device não tem registros", async () => {
        const { user, property, area, device } = await setupAll()

        const list = await consumptionService.findAllForDevice(device.id, area.id, property.id, user.id, {})

        expect(list).toEqual([])
    })

    it("deve lançar ForbiddenError ao tentar acessar device inexistente", async () => {
        const { user, property, area } = await setupAll()

        await expect(
            consumptionService.createForDevice(
                "00000000-0000-0000-0000-000000000000",
                area.id, property.id, user.id, baseConsumptionInput,
            ),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve recalcular costBrl ao atualizar kwhConsumed de registro de device", async () => {
        const { user, property, area, device } = await setupAll()
        const record = await consumptionService.createForDevice(
            device.id, area.id, property.id, user.id, baseConsumptionInput,
        )

        // kwhConsumed 10 → 4; costBrl esperado: 4 × 0,75 = 3,00
        const updated = await consumptionService.update(
            record.id, property.id, user.id, { kwhConsumed: 4 },
        )

        expect(updated.costBrl).toBeCloseTo(3)
    })
})