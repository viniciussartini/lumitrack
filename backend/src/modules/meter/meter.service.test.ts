import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { MeterService } from "@/modules/meter/meter.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prismaTest)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const meterService = new MeterService(
    meterRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
)

// ─── Dados de apoio ───────────────────────────────────────────────────────────
//
// Property e EnergyDistributor ainda não têm seus módulos atualizados para o
// schema v2 (isso é Fase 3 — catálogo de distribuidoras, electricalSystem em
// Property). Por isso o setup de teste aqui cria essas entidades direto via
// Prisma, sem passar pelos services (que continuam quebrados nesta fase,
// como documentado no plano).

let distributorSeq = 0

// CPFs distintos por e-mail — necessário porque o blind index de CPF é
// @unique: reusar o mesmo CPF para "outro usuário" causaria ConflictError
// no cadastro em vez do cenário de posse cruzada que o teste quer exercitar.
const CPF_BY_EMAIL: Record<string, string> = {
    "joao@example.com": "529.982.247-25",
    "maria@example.com": "310.037.856-38",
}

async function setupUserAndProperty(email = "joao@example.com") {
    const user = await userService.createUser({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: CPF_BY_EMAIL[email] ?? "529.982.247-25",
    })

    distributorSeq += 1
    const distributor = await prismaTest.energyDistributor.create({
        data: {
            name: "CEMIG",
            cnpj: `06.981.180/000${distributorSeq}-16`,
            state: "MG",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.18,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        },
    })

    const property = await prismaTest.property.create({
        data: {
            userId: user.id,
            distributorId: distributor.id,
            name: "Casa",
            electricalSystem: "MONOPHASIC",
        },
    })

    return { user, distributor, property }
}

async function setupUserPropertyAreaDevice(email = "joao@example.com") {
    const { user, property } = await setupUserAndProperty(email)
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name: "Ar-condicionado",
    })
    return { user, property, area, device }
}

const validMeterMqtt = {
    name: "Medidor MQTT",
    protocol: "MQTT" as const,
    host: "localhost",
    port: 1883,
    topic: "lumitrack/meter-1",
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: MeterService
// ─────────────────────────────────────────────────────────────────────────────

describe("MeterService", () => {
    describe("create", () => {
        it("cria um medidor vinculado a uma property", async () => {
            const { user, property } = await setupUserAndProperty()

            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            expect(meter.id).toBeDefined()
            expect(meter.targetType).toBe("PROPERTY")
            expect(meter.propertyId).toBe(property.id)
            expect(meter.areaId).toBeNull()
            expect(meter.deviceId).toBeNull()
            expect(meter.protocol).toBe("MQTT")
            expect(meter.host).toBe("localhost")
        })

        it("cria um medidor vinculado a uma área", async () => {
            const { user, area } = await setupUserPropertyAreaDevice()

            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "AREA",
                areaId: area.id,
            })

            expect(meter.targetType).toBe("AREA")
            expect(meter.areaId).toBe(area.id)
        })

        it("cria um medidor vinculado a um dispositivo", async () => {
            const { user, device } = await setupUserPropertyAreaDevice()

            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "DEVICE",
                deviceId: device.id,
            })

            expect(meter.targetType).toBe("DEVICE")
            expect(meter.deviceId).toBe(device.id)
        })

        it("lança ValidationError se o FK do alvo não coincide com targetType", async () => {
            const { user } = await setupUserAndProperty()

            await expect(
                meterService.create(user.id, {
                    ...validMeterMqtt,
                    targetType: "PROPERTY",
                    areaId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança NotFoundError para propertyId inexistente", async () => {
            const { user } = await setupUserAndProperty()

            await expect(
                meterService.create(user.id, {
                    ...validMeterMqtt,
                    targetType: "PROPERTY",
                    propertyId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao vincular medidor a propriedade de outro usuário", async () => {
            const { property } = await setupUserAndProperty("joao@example.com")
            const { user: userB } = await setupUserAndProperty("maria@example.com")

            await expect(
                meterService.create(userB.id, {
                    ...validMeterMqtt,
                    targetType: "PROPERTY",
                    propertyId: property.id,
                }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("lança ConflictError ao tentar vincular um segundo medidor ao mesmo alvo", async () => {
            const { user, property } = await setupUserAndProperty()

            await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            await expect(
                meterService.create(user.id, {
                    ...validMeterMqtt,
                    name: "Segundo medidor",
                    targetType: "PROPERTY",
                    propertyId: property.id,
                }),
            ).rejects.toThrow(ConflictError)
        })

        it("lança ValidationError para payload MQTT sem topic", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                meterService.create(user.id, {
                    name: "Medidor",
                    protocol: "MQTT",
                    host: "localhost",
                    port: 1883,
                    targetType: "PROPERTY",
                    propertyId: property.id,
                }),
            ).rejects.toThrow(ValidationError)
        })

        // #10 — OWASP A01 (SSRF): antes desta correção, qualquer host/port era
        // aceito sem checagem — este é o teste que reproduz o bug e falha se o
        // controle for removido (DoD do 05-security-standards.md).
        describe("proteção SSRF (allowlist de destino)", () => {
            it("lança ValidationError ao apontar para rede privada (RFC1918) sem allowlist", async () => {
                const { user, property } = await setupUserAndProperty()

                await expect(
                    meterService.create(user.id, {
                        ...validMeterMqtt,
                        host: "10.0.0.5",
                        targetType: "PROPERTY",
                        propertyId: property.id,
                    }),
                ).rejects.toThrow(ValidationError)
            })

            it("lança ValidationError ao apontar para o endereço de metadata de cloud", async () => {
                const { user, property } = await setupUserAndProperty()

                await expect(
                    meterService.create(user.id, {
                        ...validMeterMqtt,
                        host: "169.254.169.254",
                        targetType: "PROPERTY",
                        propertyId: property.id,
                    }),
                ).rejects.toThrow(ValidationError)
            })

            it("lança ValidationError para porta da denylist (ex.: 22/SSH), mesmo com host público", async () => {
                const { user, property } = await setupUserAndProperty()

                await expect(
                    meterService.create(user.id, {
                        ...validMeterMqtt,
                        host: "1.1.1.1",
                        port: 22,
                        targetType: "PROPERTY",
                        propertyId: property.id,
                    }),
                ).rejects.toThrow(ValidationError)
            })

            it("permite host público de fato alcançável na internet", async () => {
                const { user, property } = await setupUserAndProperty()

                const meter = await meterService.create(user.id, {
                    ...validMeterMqtt,
                    host: "1.1.1.1",
                    targetType: "PROPERTY",
                    propertyId: property.id,
                })

                expect(meter.host).toBe("1.1.1.1")
            })

            it("não valida destino para protocolo serial (sem host/port) — MODBUS_RTU", async () => {
                const { user, property } = await setupUserAndProperty()

                const meter = await meterService.create(user.id, {
                    name: "Medidor serial",
                    protocol: "MODBUS_RTU",
                    address: "/dev/ttyUSB0",
                    targetType: "PROPERTY",
                    propertyId: property.id,
                })

                expect(meter.address).toBe("/dev/ttyUSB0")
            })
        })
    })

    describe("findByTargetQuery", () => {
        it("retorna o medidor vinculado ao alvo", async () => {
            const { user, property } = await setupUserAndProperty()
            const created = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            const found = await meterService.findByTargetQuery(user.id, {
                targetType: "PROPERTY",
                targetId: property.id,
            })

            expect(found.id).toBe(created.id)
        })

        it("lança NotFoundError quando o alvo não tem medidor", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                meterService.findByTargetQuery(user.id, {
                    targetType: "PROPERTY",
                    targetId: property.id,
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError para alvo de outro usuário", async () => {
            const { property } = await setupUserAndProperty("joao@example.com")
            const { user: userB } = await setupUserAndProperty("maria@example.com")

            await expect(
                meterService.findByTargetQuery(userB.id, {
                    targetType: "PROPERTY",
                    targetId: property.id,
                }),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    describe("findAll", () => {
        it("retorna todos os medidores do usuário, unindo os 3 níveis de alvo", async () => {
            const { user, property, area, device } = await setupUserPropertyAreaDevice()

            await meterService.create(user.id, {
                ...validMeterMqtt,
                name: "M1",
                targetType: "PROPERTY",
                propertyId: property.id,
            })
            await meterService.create(user.id, {
                ...validMeterMqtt,
                name: "M2",
                targetType: "AREA",
                areaId: area.id,
            })
            await meterService.create(user.id, {
                ...validMeterMqtt,
                name: "M3",
                targetType: "DEVICE",
                deviceId: device.id,
            })

            const result = await meterService.findAll(user.id, {})
            expect(result.items).toHaveLength(3)
        })

        it("não retorna medidores de outro usuário", async () => {
            const { property } = await setupUserAndProperty("joao@example.com")
            const { user: userB } = await setupUserAndProperty("maria@example.com")

            await meterService.create(
                (await prismaTest.property.findFirstOrThrow({ where: { id: property.id } })).userId,
                { ...validMeterMqtt, targetType: "PROPERTY", propertyId: property.id },
            )

            const resultB = await meterService.findAll(userB.id, {})
            expect(resultB.items).toHaveLength(0)
        })
    })

    describe("update", () => {
        it("atualiza os campos de conexão do medidor", async () => {
            const { user, property } = await setupUserAndProperty()
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            const updated = await meterService.update(meter.id, user.id, {
                name: "Medidor renomeado",
                protocol: "MQTT",
                host: "novo-host",
                port: 1884,
                topic: "novo/topic",
            })

            expect(updated.name).toBe("Medidor renomeado")
            expect(updated.host).toBe("novo-host")
        })

        it("lança ForbiddenError ao atualizar medidor de outro usuário", async () => {
            const { user, property } = await setupUserAndProperty("joao@example.com")
            const { user: userB } = await setupUserAndProperty("maria@example.com")
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            await expect(
                meterService.update(meter.id, userB.id, { ...validMeterMqtt }),
            ).rejects.toThrow(ForbiddenError)
        })

        // #10 — OWASP A01 (SSRF): `PUT /api/meters/:id` dispara `restart` da
        // conexão (meter.controller.ts) — segundo caminho igualmente aberto
        // antes desta correção, hoje coberto pela mesma checagem do create.
        it("lança ValidationError ao atualizar host para rede privada sem allowlist", async () => {
            const { user, property } = await setupUserAndProperty()
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            await expect(
                meterService.update(meter.id, user.id, {
                    ...validMeterMqtt,
                    host: "192.168.50.50",
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    describe("delete", () => {
        it("remove o medidor", async () => {
            const { user, property } = await setupUserAndProperty()
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            await meterService.delete(meter.id, user.id)

            await expect(meterService.findById(meter.id, user.id)).rejects.toThrow(NotFoundError)
        })

        it("permite recriar um medidor no mesmo alvo após excluir o anterior", async () => {
            const { user, property } = await setupUserAndProperty()
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })
            await meterService.delete(meter.id, user.id)

            const recreated = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            expect(recreated.id).not.toBe(meter.id)
        })
    })

    describe("cascade: deletar propriedade remove o medidor vinculado", () => {
        it("remove o medidor automaticamente ao deletar a propriedade", async () => {
            const { user, property } = await setupUserAndProperty()
            const meter = await meterService.create(user.id, {
                ...validMeterMqtt,
                targetType: "PROPERTY",
                propertyId: property.id,
            })

            await prismaTest.property.delete({ where: { id: property.id } })

            const meterAfter = await prismaTest.meter.findUnique({ where: { id: meter.id } })
            expect(meterAfter).toBeNull()
        })
    })
})
