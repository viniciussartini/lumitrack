import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DemandAlertService } from "@/modules/demand-alert/demand-alert.service.js"
import { DemandAlertRepository } from "@/modules/demand-alert/demand-alert.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const demandAlertRepository = new DemandAlertRepository(prismaTest)
const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

async function setupUserAndMeter(
    email = "joao@example.com",
    propertyOverrides: Partial<Parameters<typeof propertyService.create>[1]> = {},
) {
    const user = await userService.createUser({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: email === "joao@example.com" ? "529.982.247-25" : "310.037.856-38",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Frigorífico",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
        tariffGroup: "GROUP_A",
        tariffSubgroup: "A4",
        tariffModality: "GREEN",
        contractedDemandKw: 200,
        ...propertyOverrides,
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
    return { user, property, meter }
}

const validInput = { name: "Ultrapassagem de demanda" }

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("DemandAlertService", () => {
    describe("create", () => {
        it("cria um alerta vinculado a um medidor Grupo A do próprio usuário, com limiar default", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            expect(alert.id).toBeDefined()
            expect(alert.userId).toBe(user.id)
            expect(alert.meterId).toBe(meter.id)
            expect(alert.thresholdPercent).toBe(105)
            expect(alert.enabled).toBe(true)
        })

        it("aceita thresholdPercent e enabled explícitos", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            const alert = await service.create(user.id, {
                ...validInput,
                meterId: meter.id,
                thresholdPercent: 90,
                enabled: false,
            })

            expect(alert.thresholdPercent).toBe(90)
            expect(alert.enabled).toBe(false)
        })

        it("lança NotFoundError para meterId inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    meterId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao vincular medidor de outro usuário", async () => {
            const { meter } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(userB.id, { ...validInput, meterId: meter.id }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("lança ValidationError para medidor de propriedade Grupo B", async () => {
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
                electricalSystem: "MONOPHASIC",
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
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, { ...validInput, meterId: meter.id }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para modalidade sem cálculo implementado (Convencional Binômia)", async () => {
            const { user, meter } = await setupUserAndMeter("joao@example.com", {
                tariffModality: "CONVENTIONAL_BINOMIAL",
            })
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, { ...validInput, meterId: meter.id }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para nome vazio", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, { ...validInput, meterId: meter.id, name: "" }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para thresholdPercent zero ou negativo", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, { ...validInput, meterId: meter.id, thresholdPercent: 0 }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para thresholdPercent acima do teto", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    meterId: meter.id,
                    thresholdPercent: 501,
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("findAll", () => {
        it("retorna apenas os alertas do usuário autenticado, paginados", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB, meter: meterB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            await service.create(userA.id, { ...validInput, meterId: meterA.id })
            await service.create(userB.id, { ...validInput, meterId: meterB.id, name: "Alerta B" })

            const result = await service.findAll(userA.id, {})

            expect(result.total).toBe(1)
            expect(result.items[0]!.name).toBe("Ultrapassagem de demanda")
        })

        it("pagina respeitando page e pageSize", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            for (let i = 0; i < 3; i++) {
                await service.create(user.id, {
                    ...validInput,
                    meterId: meter.id,
                    name: `Alerta ${i}`,
                })
            }

            const result = await service.findAll(user.id, { page: 1, pageSize: 2 })
            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(3)
        })
    })

    describe("findById", () => {
        it("retorna o alerta quando o usuário é dono", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const created = await service.create(user.id, { ...validInput, meterId: meter.id })

            const found = await service.findById(created.id, user.id)
            expect(found.id).toBe(created.id)
        })

        it("lança NotFoundError para ID inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.findById("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError quando o alerta pertence a outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(userA.id, { ...validInput, meterId: meterA.id })

            await expect(service.findById(alert.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })

    describe("update", () => {
        it("atualiza os campos permitidos", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            const updated = await service.update(alert.id, user.id, {
                name: "Renomeado",
                thresholdPercent: 95,
            })

            expect(updated.name).toBe("Renomeado")
            expect(updated.thresholdPercent).toBe(95)
        })

        it("lança NotFoundError ao atualizar alerta inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.update("00000000-0000-0000-0000-000000000000", user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao atualizar alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(userA.id, { ...validInput, meterId: meterA.id })

            await expect(service.update(alert.id, userB.id, { name: "X" })).rejects.toThrow(
                ForbiddenError,
            )
        })

        it("lança ValidationError para thresholdPercent negativo", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            await expect(
                service.update(alert.id, user.id, { thresholdPercent: -1 }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para thresholdPercent acima do teto", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            await expect(
                service.update(alert.id, user.id, { thresholdPercent: 501 }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para corpo vazio — PUT sem nenhum campo não é um no-op silencioso", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            await expect(service.update(alert.id, user.id, {})).rejects.toThrow(ValidationError)
        })
    })

    describe("patchEnabled", () => {
        it("alterna o campo enabled", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            const updated = await service.patchEnabled(alert.id, user.id, { enabled: false })

            expect(updated.enabled).toBe(false)
        })

        it("lança ValidationError quando enabled não é booleano", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            await expect(
                service.patchEnabled(alert.id, user.id, { enabled: "não" }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ForbiddenError para alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(userA.id, { ...validInput, meterId: meterA.id })

            await expect(
                service.patchEnabled(alert.id, userB.id, { enabled: false }),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("delete", () => {
        it("deleta um alerta existente", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(user.id, { ...validInput, meterId: meter.id })

            await service.delete(alert.id, user.id)

            await expect(service.findById(alert.id, user.id)).rejects.toThrow(NotFoundError)
        })

        it("lança NotFoundError ao deletar alerta inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new DemandAlertService(demandAlertRepository, meterRepository)

            await expect(
                service.delete("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao deletar alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new DemandAlertService(demandAlertRepository, meterRepository)
            const alert = await service.create(userA.id, { ...validInput, meterId: meterA.id })

            await expect(service.delete(alert.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })
})
