import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { IoTService } from "@/modules/iot/iot.service.js"
import { IoTRepository } from "@/modules/iot/iot.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────
// A cadeia de dependências reflete exatamente o que existe em produção.
// IoTService precisa de DeviceRepository, AreaRepository e PropertyRepository
// para validar a cadeia de posse: userId → property → area → device → iotConfig.
// Para montar o cenário de teste, precisamos dos services auxiliares até o nível
// de device — o mesmo padrão usado em device.service.test.ts e alert.service.test.ts.

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService    = new DistributorService(distributorRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService    = new PropertyService(propertyRepository, distributorRepository)

const areaRepository = new AreaRepository(prismaTest)
const areaService    = new AreaService(areaRepository, propertyRepository)

const deviceRepository = new DeviceRepository(prismaTest)
const deviceService    = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const iotRepository = new IoTRepository(prismaTest)
const iotService    = new IoTService(iotRepository, deviceRepository, areaRepository, propertyRepository)

const userRepository = new UserRepository(prismaTest)
const userService    = new UserService(userRepository)

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

// A distribuidora é o "contrato de energia" — prerequisito obrigatório
// para criar uma propriedade no sistema LumiTrack.
const validDistributorInput = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage:   220,
    kwhPrice:         0.75,
}

const validMqttInput = {
    protocol: "MQTT" as const,
    host:     "broker.hivemq.com",
    port:     1883,
    topic:    "lumitrack/device/001",
}

const validRs485Input = {
    protocol: "RS485" as const,
    address:  "/dev/ttyS0",
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// Cria a cadeia completa: user → distributor → property → area → device.
// Cada módulo monta o setup até o nível que ele precisa testar —
// aqui precisamos de device porque IoT é o último nível da hierarquia.

async function setupUserAndDevice(userInput = validUserA) {
    const user        = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property    = await propertyService.create(user.id, {
        name:           "Casa",
        distributorId:  distributor.id,
    })
    const area   = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name:       "Medidor Principal",
        powerWatts: 500,
    })
    return { user, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanDatabase() })
afterAll(async ()  => { await prismaTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: IoTService
// ─────────────────────────────────────────────────────────────────────────────

describe("IoTService", () => {

    // ─── create ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("deve criar config MQTT com campos obrigatórios e retornar a config", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            const config = await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            expect(config.id).toBeDefined()
            expect(config.deviceId).toBe(device.id)
            expect(config.protocol).toBe("MQTT")
            expect(config.host).toBe("broker.hivemq.com")
            expect(config.port).toBe(1883)
            expect(config.topic).toBe("lumitrack/device/001")
            expect(config.address).toBeNull()
            expect(config.extra).toBeNull()
        })

        it("deve criar config RS485 com apenas address", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            const config = await iotService.create(device.id, area.id, property.id, user.id, validRs485Input)

            expect(config.protocol).toBe("RS485")
            expect(config.address).toBe("/dev/ttyS0")
            expect(config.host).toBeNull()
            expect(config.port).toBeNull()
            expect(config.topic).toBeNull()
        })

        it("deve criar config com campo extra (baudRate)", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            const config = await iotService.create(device.id, area.id, property.id, user.id, {
                ...validRs485Input,
                extra: { baudRate: 9600 },
            })

            expect(config.extra).toEqual({ baudRate: 9600 })
        })

        it("deve lançar ConflictError se o device já tiver uma config IoT", async () => {
            // Análogo a tentar instalar dois medidores no mesmo ponto de energia:
            // o sistema impede a duplicidade antes de qualquer dano físico acontecer.
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            await expect(
                iotService.create(device.id, area.id, property.id, user.id, validRs485Input),
            ).rejects.toThrow(ConflictError)
        })

        it("deve lançar ValidationError para MQTT sem topic", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            await expect(
                iotService.create(device.id, area.id, property.id, user.id, {
                    protocol: "MQTT",
                    host:     "broker.hivemq.com",
                    port:     1883,
                    // topic ausente propositalmente
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ForbiddenError ao criar config em device de outro usuário", async () => {
            const { property, area, device } = await setupUserAndDevice(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                iotService.create(device.id, area.id, property.id, userB.id, validMqttInput),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar NotFoundError para deviceId inexistente", async () => {
            const { user, property, area } = await setupUserAndDevice()

            await expect(
                iotService.create(
                    "00000000-0000-0000-0000-000000000000",
                    area.id,
                    property.id,
                    user.id,
                    validMqttInput,
                ),
            ).rejects.toThrow(NotFoundError)
        })
    })

    // ─── findByDeviceId ───────────────────────────────────────────────────────

    describe("findByDeviceId", () => {
        it("deve retornar a config do device", async () => {
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            const config = await iotService.findByDeviceId(device.id, area.id, property.id, user.id)

            expect(config.deviceId).toBe(device.id)
            expect(config.protocol).toBe("MQTT")
        })

        it("deve lançar NotFoundError se não houver config para o device", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            await expect(
                iotService.findByDeviceId(device.id, area.id, property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError para device de outro usuário", async () => {
            const { property, area, device } = await setupUserAndDevice(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                iotService.findByDeviceId(device.id, area.id, property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("deve atualizar o topic mantendo o protocolo MQTT", async () => {
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            const updated = await iotService.update(device.id, area.id, property.id, user.id, {
                protocol: "MQTT",
                host:     "broker.hivemq.com",
                port:     1883,
                topic:    "lumitrack/device/updated",
            })

            expect(updated.topic).toBe("lumitrack/device/updated")
            expect(updated.protocol).toBe("MQTT")
        })

        it("deve trocar protocolo de MQTT para RS485 e limpar campos antigos", async () => {
            // Quando o protocolo muda, os campos exclusivos do protocolo antigo
            // devem ser nulos — como trocar o tipo de conector: os pinos
            // incompatíveis ficam vazios.
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            const updated = await iotService.update(device.id, area.id, property.id, user.id, validRs485Input)

            expect(updated.protocol).toBe("RS485")
            expect(updated.address).toBe("/dev/ttyS0")
            expect(updated.host).toBeNull()
            expect(updated.port).toBeNull()
            expect(updated.topic).toBeNull()
        })

        it("deve lançar NotFoundError ao atualizar config inexistente", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            await expect(
                iotService.update(device.id, area.id, property.id, user.id, validRs485Input),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ValidationError para MODBUS_TCP sem address", async () => {
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            await expect(
                iotService.update(device.id, area.id, property.id, user.id, {
                    protocol: "MODBUS_TCP",
                    host:     "192.168.1.10",
                    port:     502,
                    // address ausente propositalmente
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ForbiddenError para device de outro usuário", async () => {
            const { property, area, device } = await setupUserAndDevice(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                iotService.update(device.id, area.id, property.id, userB.id, validRs485Input),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── delete ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("deve remover a config e o device fica sem config", async () => {
            const { user, property, area, device } = await setupUserAndDevice()
            await iotService.create(device.id, area.id, property.id, user.id, validMqttInput)

            await iotService.delete(device.id, area.id, property.id, user.id)

            await expect(
                iotService.findByDeviceId(device.id, area.id, property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao deletar config inexistente", async () => {
            const { user, property, area, device } = await setupUserAndDevice()

            await expect(
                iotService.delete(device.id, area.id, property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError para device de outro usuário", async () => {
            const { property, area, device } = await setupUserAndDevice(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                iotService.delete(device.id, area.id, property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })
})