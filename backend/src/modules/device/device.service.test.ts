import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DeviceService } from "@/modules/device/device.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)

const deviceRepository = new DeviceRepository(prismaTest)
// DeviceService recebe AreaRepository para verificar a cadeia de posse:
// userId → property → area → device
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)

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

const validDistributorInput = {
    name: "CEMIG",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage: 220,
    kwhPrice: 0.75,
}

const validDeviceInput = {
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function setupUserAndArea(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
    })
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    return { user, property, area }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: DeviceService
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceService", () => {

    // ─── create ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("deve criar um dispositivo com todos os campos", async () => {
            const { user, area } = await setupUserAndArea()

            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            expect(device.id).toBeDefined()
            expect(device.areaId).toBe(area.id)
            expect(device.name).toBe("Ar-condicionado")
            expect(device.brand).toBe("Daikin")
            expect(device.model).toBe("Split 12000 BTU")
            expect(device.powerWatts).toBe(1200)
        })

        it("deve criar um dispositivo apenas com o nome (campos opcionais ausentes)", async () => {
            const { user, area } = await setupUserAndArea()

            const device = await deviceService.create(area.id, area.propertyId, user.id, {
                name: "Ventilador",
            })

            expect(device.name).toBe("Ventilador")
            expect(device.brand).toBeNull()
            expect(device.model).toBeNull()
            expect(device.powerWatts).toBeNull()
        })

        it("deve lançar NotFoundError ao criar dispositivo em área inexistente", async () => {
            const user = await userService.createUser(validUserA)
            const distributor = await distributorService.create(user.id, validDistributorInput)
            const property = await propertyService.create(user.id, {
                name: "Casa",
                distributorId: distributor.id,
            })

            await expect(
                deviceService.create(
                    "00000000-0000-0000-0000-000000000000",
                    property.id,
                    user.id,
                    validDeviceInput,
                ),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao criar dispositivo em área de outro usuário", async () => {
            const { area } = await setupUserAndArea(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                deviceService.create(area.id, area.propertyId, userB.id, validDeviceInput),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para nome vazio", async () => {
            const { user, area } = await setupUserAndArea()

            await expect(
                deviceService.create(area.id, area.propertyId, user.id, { name: "" }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para powerWatts zero ou negativo", async () => {
            const { user, area } = await setupUserAndArea()

            await expect(
                deviceService.create(area.id, area.propertyId, user.id, {
                    name: "Dispositivo",
                    powerWatts: 0,
                }),
            ).rejects.toThrow(ValidationError)

            await expect(
                deviceService.create(area.id, area.propertyId, user.id, {
                    name: "Dispositivo",
                    powerWatts: -100,
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── findById ─────────────────────────────────────────────────────────────

    describe("findById", () => {
        it("deve retornar o dispositivo quando o usuário é dono da área", async () => {
            const { user, area } = await setupUserAndArea()
            const created = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            const found = await deviceService.findById(created.id, area.id, area.propertyId, user.id)

            expect(found.id).toBe(created.id)
            expect(found.name).toBe("Ar-condicionado")
        })

        it("deve lançar NotFoundError para ID de dispositivo inexistente", async () => {
            const { user, area } = await setupUserAndArea()

            await expect(
                deviceService.findById("00000000-0000-0000-0000-000000000000", area.id, area.propertyId, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError quando a área pertence a outro usuário", async () => {
            const { area } = await setupUserAndArea(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                deviceService.findById(
                    "00000000-0000-0000-0000-000000000000",
                    area.id,
                    area.propertyId,
                    userB.id,
                ),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ForbiddenError quando o dispositivo pertence a outra área", async () => {
            // Cenário: dispositivo existe na área A, mas a requisição informa área B.
            // A verificação de pertencimento impede acesso cruzado entre áreas.
            const { user, property, area: areaA } = await setupUserAndArea()
            const areaB = await areaService.create(property.id, user.id, { name: "Quarto" })
            const device = await deviceService.create(areaA.id, property.id, user.id, validDeviceInput)

            await expect(
                deviceService.findById(device.id, areaB.id, property.id, user.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── findAll ──────────────────────────────────────────────────────────────

    describe("findAll", () => {
        it("deve retornar lista vazia quando a área não tem dispositivos", async () => {
            const { user, area } = await setupUserAndArea()

            const list = await deviceService.findAll(area.id, area.propertyId, user.id)

            expect(list).toEqual([])
        })

        it("deve retornar apenas os dispositivos da área especificada", async () => {
            const { user, property, area: areaA } = await setupUserAndArea()
            const areaB = await areaService.create(property.id, user.id, { name: "Quarto" })

            await deviceService.create(areaA.id, property.id, user.id, { name: "Dispositivo A" })
            await deviceService.create(areaB.id, property.id, user.id, { name: "Dispositivo B" })

            const listA = await deviceService.findAll(areaA.id, property.id, user.id)

            expect(listA).toHaveLength(1)
            expect(listA[0]?.name).toBe("Dispositivo A")
        })

        it("deve retornar dispositivos ordenados por nome", async () => {
            const { user, area } = await setupUserAndArea()

            await deviceService.create(area.id, area.propertyId, user.id, { name: "Ventilador" })
            await deviceService.create(area.id, area.propertyId, user.id, { name: "Ar-condicionado" })
            await deviceService.create(area.id, area.propertyId, user.id, { name: "Lâmpada" })

            const list = await deviceService.findAll(area.id, area.propertyId, user.id)

            expect(list[0]?.name).toBe("Ar-condicionado")
            expect(list[1]?.name).toBe("Lâmpada")
            expect(list[2]?.name).toBe("Ventilador")
        })

        it("deve lançar ForbiddenError ao listar dispositivos de área de outro usuário", async () => {
            const { area } = await setupUserAndArea(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                deviceService.findAll(area.id, area.propertyId, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("deve atualizar campos do dispositivo", async () => {
            const { user, area } = await setupUserAndArea()
            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            const updated = await deviceService.update(device.id, area.id, area.propertyId, user.id, {
                name: "Ar-condicionado Inverter",
                powerWatts: 900,
            })

            expect(updated.name).toBe("Ar-condicionado Inverter")
            expect(updated.powerWatts).toBe(900)
            expect(updated.brand).toBe("Daikin") // não mudou
        })

        it("deve lançar NotFoundError ao tentar atualizar dispositivo inexistente", async () => {
            const { user, area } = await setupUserAndArea()

            await expect(
                deviceService.update("00000000-0000-0000-0000-000000000000", area.id, area.propertyId, user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar atualizar dispositivo de área de outro usuário", async () => {
            const { area } = await setupUserAndArea(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                deviceService.update("00000000-0000-0000-0000-000000000000", area.id, area.propertyId, userB.id, { name: "X" }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para powerWatts negativo na atualização", async () => {
            const { user, area } = await setupUserAndArea()
            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            await expect(
                deviceService.update(device.id, area.id, area.propertyId, user.id, { powerWatts: -50 }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── delete ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("deve deletar um dispositivo existente", async () => {
            const { user, area } = await setupUserAndArea()
            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            await deviceService.delete(device.id, area.id, area.propertyId, user.id)

            await expect(
                deviceService.findById(device.id, area.id, area.propertyId, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar dispositivo inexistente", async () => {
            const { user, area } = await setupUserAndArea()

            await expect(
                deviceService.delete("00000000-0000-0000-0000-000000000000", area.id, area.propertyId, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar deletar dispositivo de área de outro usuário", async () => {
            const { area } = await setupUserAndArea(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                deviceService.delete("00000000-0000-0000-0000-000000000000", area.id, area.propertyId, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve cascatear o delete para os registros de consumo do dispositivo", async () => {
            const { user, area } = await setupUserAndArea()
            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            // Cria um registro de consumo vinculado ao dispositivo
            const record = await prismaTest.consumptionRecord.create({
                data: {
                    deviceId: device.id,
                    period: "DAILY",
                    referenceDate: new Date("2025-01-01"),
                    kwhConsumed: 2.5,
                },
            })

            await deviceService.delete(device.id, area.id, area.propertyId, user.id)

            const recordAfter = await prismaTest.consumptionRecord.findUnique({
                where: { id: record.id },
            })
            expect(recordAfter).toBeNull()
        })
    })

    // ─── Cascade: deletar área remove dispositivos ────────────────────────────

    describe("cascade: deletar área remove seus dispositivos", () => {
        it("deve remover os dispositivos automaticamente ao deletar a área", async () => {
            const { user, area } = await setupUserAndArea()
            const device = await deviceService.create(area.id, area.propertyId, user.id, validDeviceInput)

            await areaService.delete(area.id, area.propertyId, user.id)

            const deviceAfter = await prismaTest.device.findUnique({
                where: { id: device.id },
            })
            expect(deviceAfter).toBeNull()
        })
    })
})