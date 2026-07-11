import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AlertEvaluator } from "@/modules/alert/alert-evaluator.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const alertRepository = new AlertRepository(prismaTest)
const alertTriggerEventRepository = new AlertTriggerEventRepository(prismaTest)
const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const deviceRepository = new DeviceRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const meterTargetRepos = { meterRepository, propertyRepository, areaRepository, deviceRepository }

async function setupMeterAndAlert(overrides: { referencePowerKw?: number; tolerancePercent?: number; enabled?: boolean } = {}) {
    const user = await userService.createUser({
        email: "joao@example.com", password: "Senha@123", userType: "INDIVIDUAL",
        acceptedTerms: true, firstName: "João", lastName: "Silva", cpf: "529.982.247-25",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC",
    })
    const meter = await prismaTest.meter.create({
        data: { name: "Medidor", targetType: "PROPERTY", propertyId: property.id, protocol: "MQTT", host: "localhost", port: 1883, topic: "t" },
    })
    const alert = await prismaTest.alert.create({
        data: {
            userId: user.id,
            meterId: meter.id,
            name: "Pico de potência",
            referencePowerKw: overrides.referencePowerKw ?? 10,
            tolerancePercent: overrides.tolerancePercent ?? 2,
            enabled: overrides.enabled ?? true,
        },
    })
    return { user, property, meter, alert }
}

function buildEvaluator() {
    const userEventHub = new UserEventHub()
    const notificationStore = new NotificationStore()
    const evaluator = new AlertEvaluator(
        alertRepository, alertTriggerEventRepository, meterTargetRepos, userEventHub, notificationStore,
    )
    return { evaluator, userEventHub, notificationStore }
}

beforeEach(async () => { await cleanDatabase() })
afterAll(async () => { await prismaTest.$disconnect() })

describe("AlertEvaluator", () => {
    describe("loadCache", () => {
        it("carrega os alertas habilitados agrupados por meterId", async () => {
            const { user, meter } = await setupMeterAndAlert()
            const { evaluator, userEventHub } = buildEvaluator()
            const events: Array<{ event: string; payload: unknown }> = []
            userEventHub.addListener(user.id, (event, payload) => events.push({ event, payload }))

            await evaluator.loadCache()

            // 10kW ± 2% → faixa [9800, 10200]W. 3 amostras fora abrem o episódio.
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())

            expect(events.some((e) => e.event === "alert-firing")).toBe(true)
        })

        it("não avalia alertas desabilitados", async () => {
            const { meter } = await setupMeterAndAlert({ enabled: false })
            const { evaluator } = buildEvaluator()

            await evaluator.loadCache()
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())

            const alertRow = await prismaTest.alert.findFirstOrThrow()
            expect(evaluator.isFiring(alertRow.id)).toBe(false)
        })
    })

    describe("histerese — abertura de episódio", () => {
        it("não abre episódio com menos de 3 amostras consecutivas fora da faixa", async () => {
            const { meter, alert } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())

            expect(evaluator.isFiring(alert.id)).toBe(false)
        })

        it("abre episódio na 3ª amostra consecutiva fora da faixa e emite alert-firing start", async () => {
            const { user, meter, alert } = await setupMeterAndAlert()
            const { evaluator, userEventHub } = buildEvaluator()
            await evaluator.loadCache()

            const events: Array<{ event: string; payload: unknown }> = []
            userEventHub.addListener(user.id, (event, payload) => events.push({ event, payload }))

            const at = new Date("2026-01-01T10:00:00Z")
            await evaluator.evaluate(meter.id, 15000, at)
            await evaluator.evaluate(meter.id, 15000, at)
            await evaluator.evaluate(meter.id, 15000, at)

            expect(evaluator.isFiring(alert.id)).toBe(true)
            expect(events).toHaveLength(1)
            expect(events[0]).toEqual({
                event: "alert-firing",
                payload: { type: "start", alertId: alert.id, alertName: "Pico de potência", meterId: meter.id, startedAt: at },
            })
        })

        it("amostra dentro da faixa reseta a contagem de amostras fora", async () => {
            const { meter, alert } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 10000, new Date()) // dentro da faixa — reseta
            await evaluator.evaluate(meter.id, 15000, new Date())
            await evaluator.evaluate(meter.id, 15000, new Date())

            expect(evaluator.isFiring(alert.id)).toBe(false)
        })
    })

    describe("histerese — fechamento de episódio", () => {
        it("não fecha episódio com menos de 5 amostras consecutivas dentro da faixa", async () => {
            const { meter, alert } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 15000, new Date())
            for (let i = 0; i < 4; i++) await evaluator.evaluate(meter.id, 10000, new Date())

            expect(evaluator.isFiring(alert.id)).toBe(true)
        })

        it("fecha o episódio na 5ª amostra consecutiva dentro da faixa: persiste evento, emite end e notificação", async () => {
            const { user, meter, alert } = await setupMeterAndAlert()
            const { evaluator, userEventHub, notificationStore } = buildEvaluator()
            await evaluator.loadCache()

            const events: Array<{ event: string; payload: unknown }> = []
            userEventHub.addListener(user.id, (event, payload) => events.push({ event, payload }))

            // As 3 amostras que ABREM o episódio (a 3ª confirma e inicializa
            // min/max/soma) — amostras anteriores à confirmação não entram
            // na estatística, só a partir do momento em que o episódio é
            // confirmado.
            const startedAt = new Date("2026-01-01T10:00:00Z")
            await evaluator.evaluate(meter.id, 15000, startedAt)
            await evaluator.evaluate(meter.id, 15000, startedAt)
            await evaluator.evaluate(meter.id, 15000, startedAt) // confirma: min=max=soma=15000, count=1

            const endedAt = new Date("2026-01-01T10:00:10Z")
            for (let i = 0; i < 4; i++) await evaluator.evaluate(meter.id, 10000, endedAt)
            await evaluator.evaluate(meter.id, 10000, endedAt) // 5ª amostra dentro — fecha

            expect(evaluator.isFiring(alert.id)).toBe(false)

            const persisted = await prismaTest.alertTriggerEvent.findFirstOrThrow({ where: { alertId: alert.id } })
            expect(persisted.startedAt).toEqual(startedAt)
            expect(persisted.endedAt).toEqual(endedAt)
            expect(persisted.durationSeconds).toBe(10)
            expect(persisted.minPowerW).toBe(10000)
            expect(persisted.maxPowerW).toBe(15000)
            expect(persisted.sampleCount).toBe(6) // 1 (confirmação) + 5 (fechamento)
            expect(persisted.avgPowerW).toBeCloseTo((15000 + 10000 * 5) / 6, 6)

            const endEvent = events.find((e) => e.event === "alert-firing" && (e.payload as { type: string }).type === "end")
            expect(endEvent).toBeDefined()

            const notificationEvent = events.find((e) => e.event === "notification")
            expect(notificationEvent).toBeDefined()
            const notification = notificationEvent!.payload as { alertName: string; targetPath: string; message: string }
            expect(notification.alertName).toBe("Pico de potência")
            expect(notification.targetPath).toBe(`/propriedades/${(await prismaTest.property.findFirstOrThrow()).id}`)
            expect(notification.message).toContain("Pico de potência")

            expect(notificationStore.findAllByUser(user.id)).toHaveLength(1)
        })

        it("pode reabrir um novo episódio depois de fechar o anterior", async () => {
            const { meter, alert } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 15000, new Date())
            for (let i = 0; i < 5; i++) await evaluator.evaluate(meter.id, 10000, new Date())
            expect(evaluator.isFiring(alert.id)).toBe(false)

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 15000, new Date())
            expect(evaluator.isFiring(alert.id)).toBe(true)
        })
    })

    describe("invalidateMeter", () => {
        it("encerra o episódio imediatamente quando o alerta é desabilitado durante o disparo", async () => {
            const { user, meter, alert } = await setupMeterAndAlert()
            const { evaluator, userEventHub } = buildEvaluator()
            await evaluator.loadCache()

            const events: Array<{ event: string }> = []
            userEventHub.addListener(user.id, (event) => events.push({ event }))

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 15000, new Date())
            expect(evaluator.isFiring(alert.id)).toBe(true)

            await prismaTest.alert.update({ where: { id: alert.id }, data: { enabled: false } })
            await evaluator.invalidateMeter(meter.id)

            expect(evaluator.isFiring(alert.id)).toBe(false)
            const persisted = await prismaTest.alertTriggerEvent.findFirst({ where: { alertId: alert.id } })
            expect(persisted).not.toBeNull()
            expect(events.filter((e) => e.event === "notification")).toHaveLength(1)
        })

        it("não avalia mais amostras do medidor após o alerta ser excluído", async () => {
            const { meter, alert } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            await prismaTest.alert.delete({ where: { id: alert.id } })
            await evaluator.invalidateMeter(meter.id)

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 15000, new Date())
            expect(evaluator.isFiring(alert.id)).toBe(false)
        })
    })

    describe("getFiringByUser", () => {
        it("retorna apenas os alertas do próprio usuário em disparo", async () => {
            const { user: userA, meter: meterA, alert: alertA } = await setupMeterAndAlert()
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            for (let i = 0; i < 3; i++) await evaluator.evaluate(meterA.id, 15000, new Date())

            const firingA = evaluator.getFiringByUser(userA.id)
            expect(firingA).toHaveLength(1)
            expect(firingA[0]!.alertId).toBe(alertA.id)

            expect(evaluator.getFiringByUser("outro-usuario-qualquer")).toEqual([])
        })
    })

    describe("múltiplos alertas no mesmo medidor", () => {
        it("avalia cada alerta de forma independente", async () => {
            const { user, meter } = await setupMeterAndAlert({ referencePowerKw: 10, tolerancePercent: 2 })
            const secondAlert = await prismaTest.alert.create({
                data: { userId: user.id, meterId: meter.id, name: "Alerta 2", referencePowerKw: 20, tolerancePercent: 5, enabled: true },
            })
            const { evaluator } = buildEvaluator()
            await evaluator.loadCache()

            // 15000W está fora da faixa do primeiro alerta (9800-10200) mas
            // dentro da faixa do segundo (19000-21000)? Não — 15000 também
            // está fora da faixa do segundo. Usamos 20000W (dentro do 2º).
            for (let i = 0; i < 3; i++) await evaluator.evaluate(meter.id, 20000, new Date())

            const firstAlertId = (await prismaTest.alert.findFirstOrThrow({ where: { name: "Pico de potência" } })).id
            expect(evaluator.isFiring(firstAlertId)).toBe(true) // 20000 fora de [9800,10200]
            expect(evaluator.isFiring(secondAlert.id)).toBe(false) // 20000 dentro de [19000,21000]
        })
    })
})
