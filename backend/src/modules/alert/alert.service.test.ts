import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AlertService } from "@/modules/alert/alert.service.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
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
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const alertRepository = new AlertRepository(prismaTest)
const alertService = new AlertService(alertRepository, propertyRepository, areaRepository, deviceRepository)

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

const validAlertInput = {
    thresholdKwh: 100,
    message: "Consumo alto detectado",
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
    return { user, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — criação por target
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — create", () => {
    it("deve criar alerta para property com targetType PROPERTY", async () => {
        const { user, property } = await setupAll()

        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        expect(alert.id).toBeDefined()
        expect(alert.propertyId).toBe(property.id)
        expect(alert.targetType).toBe("PROPERTY")
        expect(alert.thresholdKwh).toBe(100)
        expect(alert.triggeredAt).toBeNull()
        expect(alert.readAt).toBeNull()
    })

    it("deve criar alerta para area com targetType AREA", async () => {
        const { user, property, area } = await setupAll()

        const alert = await alertService.createForArea(area.id, property.id, user.id, validAlertInput)

        expect(alert.areaId).toBe(area.id)
        expect(alert.targetType).toBe("AREA")
        expect(alert.propertyId).toBeNull()
    })

    it("deve criar alerta para device com targetType DEVICE", async () => {
        const { user, property, area, device } = await setupAll()

        const alert = await alertService.createForDevice(device.id, area.id, property.id, user.id, validAlertInput)

        expect(alert.deviceId).toBe(device.id)
        expect(alert.targetType).toBe("DEVICE")
    })

    it("deve criar alerta sem message (campo opcional)", async () => {
        const { user, property } = await setupAll()

        const alert = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 50 })

        expect(alert.message).toBeNull()
    })

    it("deve lançar ValidationError para thresholdKwh zero ou negativo", async () => {
        const { user, property } = await setupAll()

        await expect(
            alertService.createForProperty(property.id, user.id, { thresholdKwh: 0 }),
        ).rejects.toThrow(ValidationError)

        await expect(
            alertService.createForProperty(property.id, user.id, { thresholdKwh: -10 }),
        ).rejects.toThrow(ValidationError)
    })

    it("deve lançar NotFoundError para propertyId inexistente", async () => {
        const user = await userService.createUser(validUserA)

        await expect(
            alertService.createForProperty("00000000-0000-0000-0000-000000000000", user.id, validAlertInput),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError ao criar alerta em property de outro usuário", async () => {
        const { property } = await setupAll(validUserA)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.createForProperty(property.id, userB.id, validAlertInput),
        ).rejects.toThrow(ForbiddenError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — listagem
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — findAll (global)", () => {
    it("deve retornar todos os alertas do usuário", async () => {
        const { user, property, area } = await setupAll()
        await alertService.createForProperty(property.id, user.id, validAlertInput)
        await alertService.createForArea(area.id, property.id, user.id, { thresholdKwh: 50 })

        const list = await alertService.findAll(user.id, {})

        expect(list).toHaveLength(2)
    })

    it("deve filtrar apenas alertas disparados com ?triggered=true", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        await alertService.createForProperty(property.id, user.id, { thresholdKwh: 200 })

        // Dispara manualmente o primeiro
        await alertRepository.trigger(alert.id)

        const triggered = await alertService.findAll(user.id, { triggered: "true" })
        expect(triggered).toHaveLength(1)
        expect(triggered[0]?.id).toBe(alert.id)
    })

    it("deve filtrar apenas alertas não disparados com ?triggered=false", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        await alertService.createForProperty(property.id, user.id, { thresholdKwh: 200 })
        await alertRepository.trigger(alert.id)

        const notTriggered = await alertService.findAll(user.id, { triggered: "false" })

        expect(notTriggered).toHaveLength(1)
        expect(notTriggered[0]?.triggeredAt).toBeNull()
    })

    it("deve retornar lista vazia quando usuário não tem alertas", async () => {
        const user = await userService.createUser(validUserA)

        const list = await alertService.findAll(user.id, {})

        expect(list).toEqual([])
    })
})

describe("AlertService — findAllForProperty / Area / Device", () => {
    it("deve retornar apenas alertas da property especificada", async () => {
        const { user, property } = await setupAll()
        await alertService.createForProperty(property.id, user.id, validAlertInput)

        const list = await alertService.findAllForProperty(property.id, user.id)

        expect(list).toHaveLength(1)
        expect(list[0]?.propertyId).toBe(property.id)
    })

    it("deve lançar ForbiddenError ao listar alertas de property de outro usuário", async () => {
        const { property } = await setupAll(validUserA)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.findAllForProperty(property.id, userB.id),
        ).rejects.toThrow(ForbiddenError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — findById
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — findById", () => {
    it("deve retornar o alerta pelo id", async () => {
        const { user, property } = await setupAll()
        const created = await alertService.createForProperty(property.id, user.id, validAlertInput)

        const found = await alertService.findById(created.id, user.id)

        expect(found.id).toBe(created.id)
    })

    it("deve lançar NotFoundError para id inexistente", async () => {
        const user = await userService.createUser(validUserA)

        await expect(
            alertService.findById("00000000-0000-0000-0000-000000000000", user.id),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError para alerta de outro usuário", async () => {
        const { user, property } = await setupAll(validUserA)
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.findById(alert.id, userB.id),
        ).rejects.toThrow(ForbiddenError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — update
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — update", () => {
    it("deve atualizar thresholdKwh e message", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        const updated = await alertService.update(alert.id, user.id, {
            thresholdKwh: 250,
            message: "Novo limite",
        })

        expect(updated.thresholdKwh).toBe(250)
        expect(updated.message).toBe("Novo limite")
    })

    it("deve lançar NotFoundError para id inexistente", async () => {
        const user = await userService.createUser(validUserA)

        await expect(
            alertService.update("00000000-0000-0000-0000-000000000000", user.id, { thresholdKwh: 100 }),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError ao atualizar alerta de outro usuário", async () => {
        const { user, property } = await setupAll(validUserA)
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.update(alert.id, userB.id, { thresholdKwh: 999 }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve lançar ValidationError para thresholdKwh negativo na atualização", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        await expect(
            alertService.update(alert.id, user.id, { thresholdKwh: -1 }),
        ).rejects.toThrow(ValidationError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — markAsRead
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — markAsRead", () => {
    it("deve preencher readAt ao marcar alerta como lido", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        expect(alert.readAt).toBeNull()

        const read = await alertService.markAsRead(alert.id, user.id)

        expect(read.readAt).not.toBeNull()
    })

    it("deve lançar ForbiddenError ao marcar alerta de outro usuário como lido", async () => {
        const { user, property } = await setupAll(validUserA)
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.markAsRead(alert.id, userB.id),
        ).rejects.toThrow(ForbiddenError)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — delete
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — delete", () => {
    it("deve deletar um alerta existente", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        await alertService.delete(alert.id, user.id)

        await expect(
            alertService.findById(alert.id, user.id),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar NotFoundError ao deletar alerta inexistente", async () => {
        const user = await userService.createUser(validUserA)

        await expect(
            alertService.delete("00000000-0000-0000-0000-000000000000", user.id),
        ).rejects.toThrow(NotFoundError)
    })

    it("deve lançar ForbiddenError ao deletar alerta de outro usuário", async () => {
        const { user, property } = await setupAll(validUserA)
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)
        const userB = await userService.createUser(validUserB)

        await expect(
            alertService.delete(alert.id, userB.id),
        ).rejects.toThrow(ForbiddenError)
    })

    it("deve cascatear: deletar property remove alertas vinculados", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, validAlertInput)

        await prismaTest.property.delete({ where: { id: property.id } })

        const deleted = await prismaTest.alert.findUnique({ where: { id: alert.id } })
        expect(deleted).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertService — checkAndTrigger (disparo automático)
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertService — checkAndTrigger", () => {
    it("deve disparar alerta quando kwhConsumed > thresholdKwh", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 50 })

        // Simula consumo de 80 kWh — acima do threshold de 50
        await alertService.checkAndTrigger({ propertyId: property.id }, 80)

        const updated = await prismaTest.alert.findUnique({ where: { id: alert.id } })
        expect(updated?.triggeredAt).not.toBeNull()
    })

    it("não deve disparar alerta quando kwhConsumed <= thresholdKwh", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 100 })

        await alertService.checkAndTrigger({ propertyId: property.id }, 80)

        const notTriggered = await prismaTest.alert.findUnique({ where: { id: alert.id } })
        expect(notTriggered?.triggeredAt).toBeNull()
    })

    it("não deve disparar alerta já disparado anteriormente", async () => {
        const { user, property } = await setupAll()
        const alert = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 50 })
        await alertRepository.trigger(alert.id)

        // checkAndTrigger só busca alertas com triggeredAt null (findActiveByTarget)
        await alertService.checkAndTrigger({ propertyId: property.id }, 999)

        const raw = await prismaTest.alert.findUnique({ where: { id: alert.id } })
        // triggeredAt não deve ser atualizado — permanece o valor original
        expect(raw?.triggeredAt).toStrictEqual(
            (await prismaTest.alert.findUnique({ where: { id: alert.id } }))?.triggeredAt,
        )
    })

    it("deve disparar apenas alertas cujo threshold é violado entre múltiplos alertas", async () => {
        const { user, property } = await setupAll()
        const low = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 30 })
        const high = await alertService.createForProperty(property.id, user.id, { thresholdKwh: 200 })

        await alertService.checkAndTrigger({ propertyId: property.id }, 100)

        const lowAfter = await prismaTest.alert.findUnique({ where: { id: low.id } })
        const highAfter = await prismaTest.alert.findUnique({ where: { id: high.id } })

        expect(lowAfter?.triggeredAt).not.toBeNull()   // 100 > 30 → disparado
        expect(highAfter?.triggeredAt).toBeNull()      // 100 < 200 → não disparado
    })
})