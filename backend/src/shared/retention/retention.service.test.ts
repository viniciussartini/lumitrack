import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { createHash } from "node:crypto"
import { RetentionService } from "@/shared/retention/retention.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const authRepository = new AuthRepository(prismaTest)
const auditRepository = new AuditRepository(prismaTest)
const meterReadingRepository = new MeterReadingRepository(prismaTest)
const alertTriggerEventRepository = new AlertTriggerEventRepository(prismaTest)
const tariffFlagHistoryRepository = new TariffFlagHistoryRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// Retenção curta e redonda — facilita escrever cenários de fronteira
// (dentro/fora da janela) sem números mágicos grandes.
const retentionService = new RetentionService(
    authRepository,
    auditRepository,
    meterReadingRepository,
    alertTriggerEventRepository,
    tariffFlagHistoryRepository,
    {
        authToken: 30,
        passwordReset: 30,
        auditLog: 730,
        refreshToken: 30,
        meterReading: 90,
        alertTriggerEvent: 90,
        mfaBackupCode: 30,
        tariffFlagHistory: 730,
    },
)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function daysFromNow(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

// Cadeia mínima Property→Meter (targetType PROPERTY) para satisfazer a FK de
// MeterReading — cada chamada usa um CNPJ/tópico próprios via nextTestCnpj()
// implícito em createTestDistributor, então é seguro chamar mais de uma vez
// por teste.
async function createTestMeter(userId: string) {
    const distributor = await createTestDistributor(prismaTest)
    const property = await prismaTest.property.create({
        data: {
            userId,
            distributorId: distributor.id,
            name: "Propriedade de teste",
            electricalSystem: "MONOPHASIC",
        },
    })
    return prismaTest.meter.create({
        data: {
            name: "Medidor de teste",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            topic: `retention-test/${property.id}`,
        },
    })
}

async function createTestAlert(userId: string, meterId: string) {
    return prismaTest.alert.create({
        data: {
            userId,
            meterId,
            name: "Alerta de teste",
            referencePowerKw: 5,
            tolerancePercent: 10,
        },
    })
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────

describe("RetentionService.purgeExpiredData", () => {
    it("expurga AuthToken revogado ou expirado há mais tempo que o período de retenção, preservando os demais", async () => {
        const user = await userService.createUser(validUser)

        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                token: "revoked-old",
                channel: "MOBILE",
                revokedAt: daysAgo(35),
                expiresAt: daysFromNow(60),
            },
        })
        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                token: "revoked-recent",
                channel: "MOBILE",
                revokedAt: daysAgo(5),
                expiresAt: daysFromNow(60),
            },
        })
        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                token: "expired-old",
                channel: "MOBILE",
                revokedAt: null,
                expiresAt: daysAgo(35),
            },
        })
        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                token: "expired-recent",
                channel: "MOBILE",
                revokedAt: null,
                expiresAt: daysAgo(5),
            },
        })
        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                token: "still-valid",
                channel: "MOBILE",
                revokedAt: null,
                expiresAt: daysFromNow(60),
            },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.authTokensDeleted).toBe(2)

        const remaining = await prismaTest.authToken.findMany({ orderBy: { token: "asc" } })
        expect(remaining.map((t) => t.token).sort()).toEqual(
            ["expired-recent", "revoked-recent", "still-valid"].sort(),
        )
    })

    it("expurga PasswordReset usado ou expirado há mais tempo que o período de retenção, preservando os demais", async () => {
        const user = await userService.createUser(validUser)

        await prismaTest.passwordReset.create({
            data: {
                userId: user.id,
                token: "used-old",
                expiresAt: daysFromNow(1),
                usedAt: daysAgo(35),
            },
        })
        await prismaTest.passwordReset.create({
            data: {
                userId: user.id,
                token: "used-recent",
                expiresAt: daysFromNow(1),
                usedAt: daysAgo(5),
            },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "expired-old", expiresAt: daysAgo(35), usedAt: null },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "expired-recent", expiresAt: daysAgo(5), usedAt: null },
        })
        await prismaTest.passwordReset.create({
            data: {
                userId: user.id,
                token: "still-valid",
                expiresAt: daysFromNow(1),
                usedAt: null,
            },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.passwordResetsDeleted).toBe(2)

        const remaining = await prismaTest.passwordReset.findMany({ orderBy: { token: "asc" } })
        expect(remaining.map((r) => r.token).sort()).toEqual(
            ["expired-recent", "used-recent", "still-valid"].sort(),
        )
    })

    it("expurga AuditLog mais antigo que o período de retenção, preservando os mais recentes", async () => {
        const user = await userService.createUser(validUser)

        await prismaTest.auditLog.create({
            data: { userId: user.id, action: "LOGIN", outcome: "SUCCESS", createdAt: daysAgo(800) },
        })
        await prismaTest.auditLog.create({
            data: { userId: user.id, action: "LOGIN", outcome: "SUCCESS", createdAt: daysAgo(100) },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.auditLogsDeleted).toBe(1)

        const remaining = await prismaTest.auditLog.findMany()
        expect(remaining).toHaveLength(1)
    })

    it("expurga RefreshToken revogado ou expirado há mais tempo que o período de retenção, preservando os demais", async () => {
        const user = await userService.createUser(validUser)
        const hash = (s: string) => createHash("sha256").update(s).digest("hex")

        await prismaTest.refreshToken.create({
            data: {
                userId: user.id,
                token: hash("revoked-old"),
                expiresAt: daysFromNow(7),
                revokedAt: daysAgo(35),
            },
        })
        await prismaTest.refreshToken.create({
            data: {
                userId: user.id,
                token: hash("revoked-recent"),
                expiresAt: daysFromNow(7),
                revokedAt: daysAgo(5),
            },
        })
        await prismaTest.refreshToken.create({
            data: {
                userId: user.id,
                token: hash("expired-old"),
                expiresAt: daysAgo(35),
                revokedAt: null,
            },
        })
        await prismaTest.refreshToken.create({
            data: {
                userId: user.id,
                token: hash("still-valid"),
                expiresAt: daysFromNow(7),
                revokedAt: null,
            },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.refreshTokensDeleted).toBe(2)

        const remaining = await prismaTest.refreshToken.findMany()
        expect(remaining).toHaveLength(2)
    })

    it("expurga MeterReading mais antiga que o período de retenção, por minuteStart, preservando as demais", async () => {
        const user = await userService.createUser(validUser)
        const meter = await createTestMeter(user.id)

        const baseReading = {
            meterId: meter.id,
            kwhConsumed: 1,
            avgVoltage: 220,
            avgCurrent: 2,
            avgPowerW: 440,
            avgPowerFactor: 0.95,
            sampleCount: 60,
            secondsCovered: 60,
        }
        await prismaTest.meterReading.create({
            data: { ...baseReading, minuteStart: daysAgo(100) },
        })
        await prismaTest.meterReading.create({
            data: { ...baseReading, minuteStart: daysAgo(10) },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.meterReadingsDeleted).toBe(1)

        const remaining = await prismaTest.meterReading.findMany()
        expect(remaining).toHaveLength(1)
    })

    it("expurga AlertTriggerEvent mais antigo que o período de retenção, por createdAt, preservando os demais", async () => {
        const user = await userService.createUser(validUser)
        const meter = await createTestMeter(user.id)
        const alert = await createTestAlert(user.id, meter.id)

        const baseEvent = {
            alertId: alert.id,
            startedAt: daysAgo(100),
            endedAt: daysAgo(100),
            durationSeconds: 60,
            minPowerW: 400,
            maxPowerW: 500,
            avgPowerW: 450,
            sampleCount: 60,
        }
        await prismaTest.alertTriggerEvent.create({
            data: { ...baseEvent, createdAt: daysAgo(100) },
        })
        await prismaTest.alertTriggerEvent.create({
            data: { ...baseEvent, createdAt: daysAgo(10) },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.alertTriggerEventsDeleted).toBe(1)

        const remaining = await prismaTest.alertTriggerEvent.findMany()
        expect(remaining).toHaveLength(1)
    })

    it("expurga MfaBackupCode usado há mais tempo que o período de retenção, preservando os usados recentes e os NUNCA usados mesmo muito antigos", async () => {
        const user = await userService.createUser(validUser)

        await prismaTest.mfaBackupCode.create({
            data: {
                userId: user.id,
                codeHash: "used-old",
                usedAt: daysAgo(35),
                createdAt: daysAgo(35),
            },
        })
        await prismaTest.mfaBackupCode.create({
            data: {
                userId: user.id,
                codeHash: "used-recent",
                usedAt: daysAgo(5),
                createdAt: daysAgo(35),
            },
        })
        await prismaTest.mfaBackupCode.create({
            data: {
                userId: user.id,
                codeHash: "never-used-ancient",
                usedAt: null,
                createdAt: daysAgo(400),
            },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.mfaBackupCodesDeleted).toBe(1)

        const remaining = await prismaTest.mfaBackupCode.findMany({ orderBy: { codeHash: "asc" } })
        expect(remaining.map((c) => c.codeHash).sort()).toEqual(
            ["never-used-ancient", "used-recent"].sort(),
        )
    })

    it("expurga TariffFlagHistory mais antigo que o período de retenção, por createdAt, preservando os demais", async () => {
        await prismaTest.tariffFlagHistory.create({
            data: {
                newFlag: "YELLOW",
                newValues: {
                    greenPer100Kwh: 0,
                    yellowPer100Kwh: 1.885,
                    redP1Per100Kwh: 4.463,
                    redP2Per100Kwh: 7.877,
                },
                source: "MANUAL",
                createdAt: daysAgo(800),
            },
        })
        await prismaTest.tariffFlagHistory.create({
            data: {
                newFlag: "GREEN",
                newValues: {
                    greenPer100Kwh: 0,
                    yellowPer100Kwh: 1.885,
                    redP1Per100Kwh: 4.463,
                    redP2Per100Kwh: 7.877,
                },
                source: "MANUAL",
                createdAt: daysAgo(100),
            },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.tariffFlagHistoryDeleted).toBe(1)

        const remaining = await prismaTest.tariffFlagHistory.findMany()
        expect(remaining).toHaveLength(1)
    })

    it("não expurga nada quando não há dados elegíveis", async () => {
        const summary = await retentionService.purgeExpiredData()

        expect(summary).toEqual({
            authTokensDeleted: 0,
            passwordResetsDeleted: 0,
            auditLogsDeleted: 0,
            refreshTokensDeleted: 0,
            meterReadingsDeleted: 0,
            alertTriggerEventsDeleted: 0,
            mfaBackupCodesDeleted: 0,
            tariffFlagHistoryDeleted: 0,
        })
    })
})
