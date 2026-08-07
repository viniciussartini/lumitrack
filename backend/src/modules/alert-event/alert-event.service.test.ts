import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AlertEventService } from "@/modules/alert-event/alert-event.service.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const alertTriggerEventRepository = new AlertTriggerEventRepository(prismaTest)
const alertRepository = new AlertRepository(prismaTest)
const service = new AlertEventService(alertTriggerEventRepository, alertRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

async function setupAlertWithEvents(eventCount = 0) {
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
    })
    const meter = await prismaTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "t",
        },
    })
    const alert = await prismaTest.alert.create({
        data: {
            userId: user.id,
            meterId: meter.id,
            name: "Pico de potência",
            referencePowerKw: 10,
            tolerancePercent: 2,
        },
    })

    for (let i = 0; i < eventCount; i++) {
        await prismaTest.alertTriggerEvent.create({
            data: {
                alertId: alert.id,
                startedAt: new Date(Date.now() - (i + 1) * 60_000),
                endedAt: new Date(Date.now() - i * 60_000),
                durationSeconds: 60,
                minPowerW: 9000,
                maxPowerW: 11000,
                avgPowerW: 10000,
                sampleCount: 10,
            },
        })
    }

    return { user, alert }
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("AlertEventService.list", () => {
    it("retorna paginado o histórico de episódios de um alerta", async () => {
        const { user, alert } = await setupAlertWithEvents(3)

        const result = await service.list(user.id, { alertId: alert.id })

        expect(result.total).toBe(3)
        expect(result.items).toHaveLength(3)
    })

    it("retorna lista vazia para alerta sem episódios", async () => {
        const { user, alert } = await setupAlertWithEvents(0)

        const result = await service.list(user.id, { alertId: alert.id })

        expect(result.items).toEqual([])
        expect(result.total).toBe(0)
    })

    it("pagina respeitando page e pageSize", async () => {
        const { user, alert } = await setupAlertWithEvents(5)

        const result = await service.list(user.id, { alertId: alert.id, page: 1, pageSize: 2 })

        expect(result.items).toHaveLength(2)
        expect(result.total).toBe(5)
    })

    it("lança NotFoundError para alertId inexistente", async () => {
        const user = await userService.createUser({
            email: "joao@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "João",
            lastName: "Silva",
            cpf: "529.982.247-25",
        })

        await expect(
            service.list(user.id, { alertId: "00000000-0000-0000-0000-000000000000" }),
        ).rejects.toThrow(NotFoundError)
    })

    it("lança ForbiddenError quando o alerta pertence a outro usuário", async () => {
        const { alert } = await setupAlertWithEvents(1)
        const userB = await userService.createUser({
            email: "maria@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Maria",
            lastName: "Santos",
            cpf: "310.037.856-38",
        })

        await expect(service.list(userB.id, { alertId: alert.id })).rejects.toThrow(ForbiddenError)
    })

    it("lança ValidationError para alertId ausente", async () => {
        const { user } = await setupAlertWithEvents(0)

        await expect(service.list(user.id, {})).rejects.toThrow(ValidationError)
    })

    it("lança ValidationError para alertId que não é UUID", async () => {
        const { user } = await setupAlertWithEvents(0)

        await expect(service.list(user.id, { alertId: "nao-e-uuid" })).rejects.toThrow(
            ValidationError,
        )
    })
})
