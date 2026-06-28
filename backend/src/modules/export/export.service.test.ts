import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ExportService } from "@/modules/export/export.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertService } from "@/modules/alert/alert.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

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

const alertRepository = new AlertRepository(prismaTest)
const alertService = new AlertService(alertRepository, propertyRepository, areaRepository, deviceRepository)

const auditRepository = new AuditRepository(prismaTest)

const exportService = new ExportService(
    userRepository,
    propertyRepository,
    distributorRepository,
    alertRepository,
    areaRepository,
    deviceRepository,
    consumptionRepository,
    auditRepository,
)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const validUserB = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
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

// Cria a cadeia completa user → distributor → property → area → device,
// com um registro de consumo em cada um dos 3 níveis (exercita a resolução
// polimórfica de ConsumptionRecord), um alerta e uma linha de audit log.
async function setupFull(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
    })
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name: "Ar-condicionado",
        powerWatts: 1000,
    })

    await consumptionService.createForProperty(property.id, user.id, {
        period: "MONTHLY",
        referenceDate: "2025-01-01",
        kwhConsumed: 100,
    })
    await consumptionService.createForArea(area.id, property.id, user.id, {
        period: "MONTHLY",
        referenceDate: "2025-01-01",
        kwhConsumed: 50,
    })
    await consumptionService.createForDevice(device.id, area.id, property.id, user.id, {
        period: "MONTHLY",
        referenceDate: "2025-01-01",
        kwhConsumed: 20,
    })

    await alertService.createForProperty(property.id, user.id, { thresholdKwh: 500 })

    await auditRepository.create({
        userId: user.id,
        action: "LOGIN",
        outcome: "SUCCESS",
        resourceType: "User",
        resourceId: user.id,
    })

    return { user, distributor, property, area, device }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanDatabase() })
afterAll(async () => { await prismaTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────

describe("ExportService.generate", () => {

    it("agrega todos os dados pessoais do titular", async () => {
        const { user, distributor, property, area, device } = await setupFull()

        const payload = await exportService.generate(user.id)

        expect(payload.generatedAt).toBeInstanceOf(Date)
        expect(payload.user.id).toBe(user.id)
        // CPF retorna decifrado (texto claro), não o ciphertext
        expect(payload.user.cpf).toBe("529.982.247-25")

        expect(payload.properties).toHaveLength(1)
        expect(payload.properties[0]!.id).toBe(property.id)

        expect(payload.distributors).toHaveLength(1)
        expect(payload.distributors[0]!.id).toBe(distributor.id)

        expect(payload.areas).toHaveLength(1)
        expect(payload.areas[0]!.id).toBe(area.id)

        expect(payload.devices).toHaveLength(1)
        expect(payload.devices[0]!.id).toBe(device.id)

        expect(payload.alerts).toHaveLength(1)

        // Os 3 níveis (property/area/device) devem aparecer — confirma a
        // resolução polimórfica via OR de relação aninhada.
        expect(payload.consumptionRecords).toHaveLength(3)
        expect(payload.consumptionRecords.map((r) => r.propertyId).filter(Boolean)).toHaveLength(1)
        expect(payload.consumptionRecords.map((r) => r.areaId).filter(Boolean)).toHaveLength(1)
        expect(payload.consumptionRecords.map((r) => r.deviceId).filter(Boolean)).toHaveLength(1)

        expect(payload.auditLogs).toHaveLength(1)
        expect(payload.auditLogs[0]!.action).toBe("LOGIN")
    })

    it("isola completamente os dados entre usuários diferentes", async () => {
        const { user: userA } = await setupFull(validUserA)
        const { user: userB } = await setupFull(validUserB)

        const payloadA = await exportService.generate(userA.id)
        const payloadB = await exportService.generate(userB.id)

        expect(payloadA.user.id).toBe(userA.id)
        expect(payloadB.user.id).toBe(userB.id)

        const idsA = payloadA.properties.map((p) => p.id)
        const idsB = payloadB.properties.map((p) => p.id)
        expect(idsA).not.toEqual(idsB)

        expect(payloadA.consumptionRecords).toHaveLength(3)
        expect(payloadB.consumptionRecords).toHaveLength(3)
        expect(payloadA.auditLogs).toHaveLength(1)
        expect(payloadB.auditLogs).toHaveLength(1)
    })

    it("retorna listas vazias para usuário sem nenhum dado além do perfil", async () => {
        const user = await userService.createUser(validUserA)

        const payload = await exportService.generate(user.id)

        expect(payload.properties).toEqual([])
        expect(payload.distributors).toEqual([])
        expect(payload.areas).toEqual([])
        expect(payload.devices).toEqual([])
        expect(payload.alerts).toEqual([])
        expect(payload.consumptionRecords).toEqual([])
        expect(payload.auditLogs).toEqual([])
    })

    it("lança NotFoundError para userId inexistente", async () => {
        await expect(exportService.generate("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
            NotFoundError,
        )
    })
})
