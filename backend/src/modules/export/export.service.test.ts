import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ExportService } from "@/modules/export/export.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { DemandAlertRepository } from "@/modules/demand-alert/demand-alert.repository.js"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { ReportRepository } from "@/modules/report/report.repository.js"
import { ReportScheduleRepository } from "@/modules/report-schedule/report-schedule.repository.js"
import { GoalRepository } from "@/modules/goal/goal.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const distributorRepository = new DistributorRepository(prismaTest)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)

const deviceRepository = new DeviceRepository(prismaTest)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)

const alertRepository = new AlertRepository(prismaTest)
const demandAlertRepository = new DemandAlertRepository(prismaTest)
const aclContractRepository = new AclContractRepository(prismaTest)

const auditRepository = new AuditRepository(prismaTest)
const reportRepository = new ReportRepository(prismaTest)
const reportScheduleRepository = new ReportScheduleRepository(prismaTest)
const goalRepository = new GoalRepository(prismaTest)

const exportService = new ExportService(
    userRepository,
    propertyRepository,
    distributorRepository,
    alertRepository,
    demandAlertRepository,
    aclContractRepository,
    areaRepository,
    deviceRepository,
    auditRepository,
    reportRepository,
    reportScheduleRepository,
    goalRepository,
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

// Cria a cadeia completa user → distributor (catálogo) → property → area →
// device, um medidor + alerta (inseridos direto via Prisma, sem instanciar
// MeterService/AlertService neste arquivo — só precisamos de uma linha
// válida contra o schema atual para testar a agregação do export) e uma
// linha de audit log.
async function setupFull(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
    })
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name: "Ar-condicionado",
        powerWatts: 1000,
    })

    const meter = await prismaTest.meter.create({
        data: {
            name: "Medidor Casa",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/medidor",
        },
    })
    await prismaTest.alert.create({
        data: {
            userId: user.id,
            meterId: meter.id,
            name: "Pico de potência",
            referencePowerKw: 10,
            tolerancePercent: 2,
        },
    })
    await prismaTest.demandAlert.create({
        data: {
            userId: user.id,
            meterId: meter.id,
            name: "Ultrapassagem de demanda",
            thresholdPercent: 105,
        },
    })
    await prismaTest.aclContract.create({
        data: {
            userId: user.id,
            propertyId: property.id,
            retailerName: "Comerc Energia",
            submarket: "SOUTHEAST_CENTER_WEST",
            energySource: "CONVENTIONAL",
            energyPricePerMwh: 280,
            contractedVolumeMwh: 120,
            validFrom: new Date("2026-01-01"),
        },
    })

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

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

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

        // Distribuidora é catálogo global — o export traz só as
        // efetivamente vinculadas às propriedades do titular.
        expect(payload.distributors).toHaveLength(1)
        expect(payload.distributors[0]!.id).toBe(distributor.id)

        expect(payload.areas).toHaveLength(1)
        expect(payload.areas[0]!.id).toBe(area.id)

        expect(payload.devices).toHaveLength(1)
        expect(payload.devices[0]!.id).toBe(device.id)

        expect(payload.alerts).toHaveLength(1)
        expect(payload.demandAlerts).toHaveLength(1)
        expect(payload.aclContracts).toHaveLength(1)
        expect(payload.aclContracts[0]!.retailerName).toBe("Comerc Energia")

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
        expect(payload.demandAlerts).toEqual([])
        expect(payload.aclContracts).toEqual([])
        expect(payload.reports).toEqual([])
        expect(payload.reportSchedules).toEqual([])
        expect(payload.goals).toEqual([])
        expect(payload.auditLogs).toEqual([])
    })

    it("inclui só os metadados dos relatórios do próprio titular, nunca os arquivos", async () => {
        const userA = await userService.createUser(validUserA)
        const userB = await userService.createUser(validUserB)
        const base = {
            targetType: "PROPERTY" as const,
            targetId: "00000000-0000-4000-8000-000000000001",
            type: "MONTHLY" as const,
            format: "CSV" as const,
            origin: "MANUAL" as const,
            periodStart: new Date("2026-07-01T03:00:00.000Z"),
            periodEnd: new Date("2026-08-01T03:00:00.000Z"),
            fileName: "lumitrack-relatorio-monthly-2026-07.csv",
            content: Buffer.from("segredo-do-arquivo"),
        }
        await reportRepository.create({ ...base, userId: userA.id })
        await reportRepository.create({ ...base, userId: userB.id })

        const payload = await exportService.generate(userA.id)

        expect(payload.reports).toHaveLength(1)
        expect(payload.reports[0]).toMatchObject({ userId: userA.id, type: "MONTHLY" })
        expect(JSON.stringify(payload)).not.toContain("segredo-do-arquivo")
        expect(payload.reports[0]).not.toHaveProperty("content")
    })

    it("inclui as configurações de envio automático só do titular, com os destinatários e sem o userId", async () => {
        const userA = await userService.createUser(validUserA)
        const userB = await userService.createUser(validUserB)
        const base = {
            targetType: "PROPERTY" as const,
            targetId: "00000000-0000-4000-8000-000000000001",
            type: "CONSUMPTION" as const,
            format: "PDF" as const,
            frequency: "MONTHLY" as const,
            sendDay: 5,
        }
        await reportScheduleRepository.create(userA.id, {
            ...base,
            recipients: ["financeiro@example.com"],
            active: true,
            nextRunAt: null,
        })
        await reportScheduleRepository.create(userB.id, {
            ...base,
            recipients: ["outro@example.com"],
            active: true,
            nextRunAt: null,
        })

        const payload = await exportService.generate(userA.id)

        expect(payload.reportSchedules).toHaveLength(1)
        expect(payload.reportSchedules[0]!.recipients).toEqual(["financeiro@example.com"])
        expect(payload.reportSchedules[0]).not.toHaveProperty("userId")
        expect(JSON.stringify(payload)).not.toContain("outro@example.com")
    })

    it("inclui as metas de consumo só do titular, sem o userId", async () => {
        const userA = await userService.createUser(validUserA)
        const userB = await userService.createUser(validUserB)
        const distributor = await createTestDistributor(prismaTest)
        const propertyA = await propertyService.create(userA.id, {
            name: "Casa A",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
        })
        const propertyB = await propertyService.create(userB.id, {
            name: "Casa B",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
        })
        const base = {
            year: 2026,
            referenceYear: 2025,
            monthlyKwh: Array.from({ length: 12 }, () => 300),
            alertPercent: 85,
        }
        await goalRepository.create(userA.id, { ...base, propertyId: propertyA.id })
        await goalRepository.create(userB.id, { ...base, propertyId: propertyB.id, year: 2027 })

        const payload = await exportService.generate(userA.id)

        expect(payload.goals).toHaveLength(1)
        expect(payload.goals[0]).toMatchObject({ propertyId: propertyA.id, year: 2026 })
        expect(payload.goals[0]).not.toHaveProperty("userId")
    })

    it("lança NotFoundError para userId inexistente", async () => {
        await expect(
            exportService.generate("00000000-0000-0000-0000-000000000000"),
        ).rejects.toThrow(NotFoundError)
    })
})
