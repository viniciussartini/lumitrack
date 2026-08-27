import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { decryptMeterCredential } from "@/shared/crypto/meterCredentialEncryption.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const meterRepository = new MeterRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

let distributorSeq = 0

async function setupUserAndProperty() {
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
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

    return { user, property }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// Cifra de Meter.extra.password + omissão do MeterResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("MeterRepository — cifra da credencial MQTT", () => {
    it("nunca persiste extra.password em texto claro na coluna", async () => {
        const { property } = await setupUserAndProperty()
        const plaintext = "senha-mqtt-super-secreta"

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: plaintext },
        })

        const stored = await prismaTest.meter.findUniqueOrThrow({ where: { id: meter.id } })
        const storedExtra = stored.extra as Record<string, unknown>

        expect(storedExtra.password).toBeDefined()
        expect(storedExtra.password).not.toBe(plaintext)
        expect(typeof storedExtra.password).toBe("string")
        // Confirma que é de fato um ciphertext decifrável, não lixo qualquer.
        expect(decryptMeterCredential(storedExtra.password as string)).toBe(plaintext)
    })

    it("toMeterResponse nunca devolve a senha — expõe passwordSet: true no lugar", async () => {
        const { property } = await setupUserAndProperty()

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: "senha-mqtt-super-secreta" },
        })

        expect(meter.extra).not.toHaveProperty("password")
        expect(meter.extra).toMatchObject({ username: "user-mqtt", passwordSet: true })

        // Mesmo comportamento em toda leitura, não só no retorno do create.
        const fetched = await meterRepository.findById(meter.id)
        expect(fetched?.extra).not.toHaveProperty("password")
        expect(fetched?.extra).toMatchObject({ passwordSet: true })
    })

    it("medidor MQTT sem senha: passwordSet é false, sem lançar", async () => {
        const { property } = await setupUserAndProperty()

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt" },
        })

        expect(meter.extra).toMatchObject({ username: "user-mqtt", passwordSet: false })
    })

    it("medidor de outro protocolo não ganha passwordSet (extra passa intocado)", async () => {
        const { property } = await setupUserAndProperty()

        const meter = await meterRepository.create({
            name: "Medidor Forno",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MODBUS_TCP",
            host: "localhost",
            port: 502,
            address: "1",
            extra: { pollingIntervalMs: 5000 },
        })

        expect(meter.extra).toEqual({ pollingIntervalMs: 5000 })
        expect(meter.extra).not.toHaveProperty("passwordSet")
    })

    it("findConnectionConfigById devolve extra.password decifrado, para uso do worker IoT", async () => {
        const { property } = await setupUserAndProperty()
        const plaintext = "senha-mqtt-super-secreta"

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: plaintext },
        })

        const config = await meterRepository.findConnectionConfigById(meter.id)

        expect(config?.extra).toEqual({ username: "user-mqtt", password: plaintext })
    })

    it("findAllConnectionConfigs decifra todos os medidores MQTT de uma vez", async () => {
        const { property } = await setupUserAndProperty()
        await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: "senha-1" },
        })

        const configs = await meterRepository.findAllConnectionConfigs()

        expect(configs).toHaveLength(1)
        expect((configs[0]?.extra as Record<string, unknown>).password).toBe("senha-1")
    })

    it("update recifra a senha com um ciphertext novo (IV distinto)", async () => {
        const { property } = await setupUserAndProperty()
        const plaintext = "senha-mqtt-super-secreta"

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: plaintext },
        })
        const firstStored = await prismaTest.meter.findUniqueOrThrow({ where: { id: meter.id } })

        await meterRepository.update(meter.id, {
            name: "Medidor Geral",
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: plaintext },
        })
        const secondStored = await prismaTest.meter.findUniqueOrThrow({ where: { id: meter.id } })

        const firstExtra = firstStored.extra as Record<string, unknown>
        const secondExtra = secondStored.extra as Record<string, unknown>
        expect(secondExtra.password).not.toBe(firstExtra.password)

        const config = await meterRepository.findConnectionConfigById(meter.id)
        expect((config?.extra as Record<string, unknown>).password).toBe(plaintext)
    })

    it("update sem `extra` no payload preserva a credencial existente (não apaga)", async () => {
        const { property } = await setupUserAndProperty()
        const plaintext = "senha-mqtt-super-secreta"

        const meter = await meterRepository.create({
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
            extra: { username: "user-mqtt", password: plaintext },
        })

        // Payload sem a chave `extra` — cenário real de um PUT que só muda
        // nome/host/port/topic (o schema de update permite `extra` ausente,
        // updateMeterSchema.ts:187, para não forçar reenvio da senha em toda
        // edição).
        await meterRepository.update(meter.id, {
            name: "Medidor Geral (renomeado)",
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/teste",
        })

        const config = await meterRepository.findConnectionConfigById(meter.id)
        expect((config?.extra as Record<string, unknown>).username).toBe("user-mqtt")
        expect((config?.extra as Record<string, unknown>).password).toBe(plaintext)
    })
})
