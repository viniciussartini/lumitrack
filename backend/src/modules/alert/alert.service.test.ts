import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { AlertService } from "@/modules/alert/alert.service.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import type { AlertEvaluator, FiringAlert } from "@/modules/alert/alert-evaluator.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const alertRepository = new AlertRepository(prismaTest)
const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const meterTargetRepos = { meterRepository }

// Fake mínimo do AlertEvaluator — o service só chama isFiring/getFiringByUser/
// invalidateMeter, então um fake simples evita subir o pipeline de amostras
// inteiro só para testar o CRUD.
function buildFakeEvaluator(firingAlertIds: Set<string> = new Set()) {
    const invalidateMeter = vi.fn().mockResolvedValue(undefined)
    const evaluator = {
        isFiring: (alertId: string) => firingAlertIds.has(alertId),
        getFiringByUser: (): FiringAlert[] => [],
        invalidateMeter,
    } as unknown as AlertEvaluator
    return { evaluator, invalidateMeter }
}

async function setupUserAndMeter(email = "joao@example.com") {
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
    return { user, property, meter }
}

const validAlertInput = {
    name: "Pico de potência",
    referencePowerKw: 10,
    tolerancePercent: 2,
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("AlertService", () => {
    describe("create", () => {
        it("cria um alerta vinculado a um medidor do próprio usuário", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)

            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            expect(alert.id).toBeDefined()
            expect(alert.userId).toBe(user.id)
            expect(alert.meterId).toBe(meter.id)
            expect(alert.name).toBe("Pico de potência")
            expect(alert.referencePowerKw).toBe(10)
            expect(alert.tolerancePercent).toBe(2)
            expect(alert.enabled).toBe(true) // default
        })

        it("aceita enabled explícito", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)

            const alert = await service.create(user.id, {
                ...validAlertInput,
                meterId: meter.id,
                enabled: false,
            })

            expect(alert.enabled).toBe(false)
        })

        it("invalida o cache do evaluator para o medidor após criar", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator, invalidateMeter } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)

            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            expect(invalidateMeter).toHaveBeenCalledWith(alert.meterId)
        })

        it("lança NotFoundError para meterId inexistente", async () => {
            const user = await userService.createUser({
                email: "joao@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "João",
                lastName: "Silva",
                cpf: "529.982.247-25",
            })
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.create(user.id, {
                    ...validAlertInput,
                    meterId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao vincular medidor de outro usuário", async () => {
            const { meter } = await setupUserAndMeter("joao@example.com")
            const userB = await userService.createUser({
                email: "maria@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "Maria",
                lastName: "Santos",
                cpf: "310.037.856-38",
            })
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.create(userB.id, { ...validAlertInput, meterId: meter.id }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("lança ValidationError para nome vazio", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.create(user.id, { ...validAlertInput, meterId: meter.id, name: "" }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para referencePowerKw zero ou negativo", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.create(user.id, {
                    ...validAlertInput,
                    meterId: meter.id,
                    referencePowerKw: 0,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para tolerancePercent acima de 100", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.create(user.id, {
                    ...validAlertInput,
                    meterId: meter.id,
                    tolerancePercent: 101,
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("findAll", () => {
        it("retorna paginado com status e target resolvidos", async () => {
            const { user, meter, property } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            const result = await service.findAll(user.id, {})

            expect(result.total).toBe(1)
            expect(result.items[0]!.id).toBe(alert.id)
            expect(result.items[0]!.status).toBe("normal")
            expect(result.items[0]!.target).toEqual({
                type: "PROPERTY",
                name: "Casa",
                path: `/propriedades/${property.id}`,
            })
        })

        it("marca como firing quando o evaluator reporta o alerta em disparo", async () => {
            const { user, meter } = await setupUserAndMeter()
            const bareService = new AlertService(alertRepository, meterTargetRepos)
            const alert = await bareService.create(user.id, {
                ...validAlertInput,
                meterId: meter.id,
            })

            const { evaluator } = buildFakeEvaluator(new Set([alert.id]))
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)

            const result = await service.findAll(user.id, {})
            expect(result.items[0]!.status).toBe("firing")
        })

        it("retorna apenas os alertas do usuário autenticado", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB, meter: meterB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)

            await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })
            await service.create(userB.id, {
                ...validAlertInput,
                meterId: meterB.id,
                name: "Alerta B",
            })

            const resultA = await service.findAll(userA.id, {})
            expect(resultA.items).toHaveLength(1)
            expect(resultA.items[0]!.name).toBe("Pico de potência")
        })

        it("pagina respeitando page e pageSize", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)
            for (let i = 0; i < 3; i++) {
                await service.create(user.id, {
                    ...validAlertInput,
                    meterId: meter.id,
                    name: `Alerta ${i}`,
                })
            }

            const result = await service.findAll(user.id, { page: 1, pageSize: 2 })
            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(3)
        })

        // resolveMeterTargets (batch) precisa associar o target certo a
        // cada alerta mesmo com targetType misto na mesma página,
        // já que cada tipo antes batia numa forma de query diferente.
        it("resolve o target correto por alerta numa página com targetType misto", async () => {
            const { user, property, meter: propertyMeter } = await setupUserAndMeter()
            const area = await prismaTest.area.create({
                data: { propertyId: property.id, name: "Sala" },
            })
            const areaMeter = await prismaTest.meter.create({
                data: {
                    name: "Medidor da área",
                    targetType: "AREA",
                    areaId: area.id,
                    protocol: "MQTT",
                    host: "localhost",
                    port: 1883,
                    topic: "t2",
                },
            })
            const device = await prismaTest.device.create({
                data: { areaId: area.id, name: "Ar-condicionado" },
            })
            const deviceMeter = await prismaTest.meter.create({
                data: {
                    name: "Medidor do device",
                    targetType: "DEVICE",
                    deviceId: device.id,
                    protocol: "MQTT",
                    host: "localhost",
                    port: 1883,
                    topic: "t3",
                },
            })
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alertProperty = await service.create(user.id, {
                ...validAlertInput,
                meterId: propertyMeter.id,
                name: "Alerta propriedade",
            })
            const alertArea = await service.create(user.id, {
                ...validAlertInput,
                meterId: areaMeter.id,
                name: "Alerta área",
            })
            const alertDevice = await service.create(user.id, {
                ...validAlertInput,
                meterId: deviceMeter.id,
                name: "Alerta device",
            })

            const result = await service.findAll(user.id, { pageSize: 10 })

            const byId = new Map(result.items.map((item) => [item.id, item]))
            expect(byId.get(alertProperty.id)?.target).toEqual({
                type: "PROPERTY",
                name: "Casa",
                path: `/propriedades/${property.id}`,
            })
            expect(byId.get(alertArea.id)?.target).toEqual({
                type: "AREA",
                name: "Sala",
                path: `/propriedades/${property.id}/areas/${area.id}`,
            })
            expect(byId.get(alertDevice.id)?.target).toEqual({
                type: "DEVICE",
                name: "Ar-condicionado",
                path: `/propriedades/${property.id}/areas/${area.id}/devices/${device.id}`,
            })
        })
    })

    describe("countEnabled", () => {
        it("conta só os alertas habilitados do usuário autenticado", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB, meter: meterB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)
            await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })
            await service.create(userA.id, {
                ...validAlertInput,
                meterId: meterA.id,
                name: "Desabilitado",
                enabled: false,
            })
            await service.create(userB.id, { ...validAlertInput, meterId: meterB.id })

            expect(await service.countEnabled(userA.id)).toBe(1)
        })

        it("retorna 0 quando o usuário não tem nenhum alerta habilitado", async () => {
            const { user } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            expect(await service.countEnabled(user.id)).toBe(0)
        })
    })

    describe("findFiring", () => {
        it("delega para o evaluator.getFiringByUser", async () => {
            const user = await userService.createUser({
                email: "joao@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "João",
                lastName: "Silva",
                cpf: "529.982.247-25",
            })
            const fakeFiring: FiringAlert[] = [
                { alertId: "a1", meterId: "m1", alertName: "X", startedAt: new Date() },
            ]
            const evaluator = { getFiringByUser: () => fakeFiring } as unknown as AlertEvaluator
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)

            expect(await service.findFiring(user.id)).toEqual(fakeFiring)
        })

        it("retorna lista vazia quando não há evaluator configurado", async () => {
            const user = await userService.createUser({
                email: "joao@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "João",
                lastName: "Silva",
                cpf: "529.982.247-25",
            })
            const service = new AlertService(alertRepository, meterTargetRepos)

            expect(await service.findFiring(user.id)).toEqual([])
        })
    })

    describe("findById", () => {
        it("retorna o alerta quando o usuário é dono", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)
            const created = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            const found = await service.findById(created.id, user.id)
            expect(found.id).toBe(created.id)
        })

        it("lança NotFoundError para ID inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.findById("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError quando o alerta pertence a outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })

            await expect(service.findById(alert.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })

    describe("update", () => {
        it("atualiza os campos permitidos", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator, invalidateMeter } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            const updated = await service.update(alert.id, user.id, {
                name: "Renomeado",
                referencePowerKw: 15,
            })

            expect(updated.name).toBe("Renomeado")
            expect(updated.referencePowerKw).toBe(15)
            expect(invalidateMeter).toHaveBeenCalledWith(meter.id)
        })

        it("lança NotFoundError ao atualizar alerta inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.update("00000000-0000-0000-0000-000000000000", user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao atualizar alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })

            await expect(service.update(alert.id, userB.id, { name: "X" })).rejects.toThrow(
                ForbiddenError,
            )
        })

        it("lança ValidationError para tolerancePercent negativo", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            await expect(
                service.update(alert.id, user.id, { tolerancePercent: -1 }),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("patchEnabled", () => {
        it("alterna o campo enabled e invalida o cache", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator, invalidateMeter } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            const updated = await service.patchEnabled(alert.id, user.id, { enabled: false })

            expect(updated.enabled).toBe(false)
            expect(invalidateMeter).toHaveBeenCalledWith(meter.id)
        })

        it("lança ValidationError quando enabled não é booleano", async () => {
            const { user, meter } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            await expect(
                service.patchEnabled(alert.id, user.id, { enabled: "não" }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ForbiddenError para alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })

            await expect(
                service.patchEnabled(alert.id, userB.id, { enabled: false }),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("delete", () => {
        it("deleta um alerta existente e invalida o cache", async () => {
            const { user, meter } = await setupUserAndMeter()
            const { evaluator, invalidateMeter } = buildFakeEvaluator()
            const service = new AlertService(alertRepository, meterTargetRepos, evaluator)
            const alert = await service.create(user.id, { ...validAlertInput, meterId: meter.id })

            await service.delete(alert.id, user.id)

            await expect(service.findById(alert.id, user.id)).rejects.toThrow(NotFoundError)
            expect(invalidateMeter).toHaveBeenCalledWith(meter.id)
        })

        it("lança NotFoundError ao deletar alerta inexistente", async () => {
            const { user } = await setupUserAndMeter()
            const service = new AlertService(alertRepository, meterTargetRepos)

            await expect(
                service.delete("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao deletar alerta de outro usuário", async () => {
            const { user: userA, meter: meterA } = await setupUserAndMeter("joao@example.com")
            const { user: userB } = await setupUserAndMeter("maria@example.com")
            const service = new AlertService(alertRepository, meterTargetRepos)
            const alert = await service.create(userA.id, { ...validAlertInput, meterId: meterA.id })

            await expect(service.delete(alert.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })
})
