import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { RetentionService } from "@/shared/retention/retention.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const authRepository = new AuthRepository(prismaTest)
const auditRepository = new AuditRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// Retenção curta e redonda — facilita escrever cenários de fronteira
// (dentro/fora da janela) sem números mágicos grandes.
const retentionService = new RetentionService(authRepository, auditRepository, {
    authToken: 30,
    passwordReset: 30,
    auditLog: 730,
    refreshToken: 30,
})

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

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => { await cleanDatabase() })
afterAll(async () => { await prismaTest.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────────

describe("RetentionService.purgeExpiredData", () => {

    it("expurga AuthToken revogado ou expirado há mais tempo que o período de retenção, preservando os demais", async () => {
        const user = await userService.createUser(validUser)

        await prismaTest.authToken.create({
            data: { userId: user.id, token: "revoked-old", channel: "MOBILE", revokedAt: daysAgo(35), expiresAt: daysFromNow(60) },
        })
        await prismaTest.authToken.create({
            data: { userId: user.id, token: "revoked-recent", channel: "MOBILE", revokedAt: daysAgo(5), expiresAt: daysFromNow(60) },
        })
        await prismaTest.authToken.create({
            data: { userId: user.id, token: "expired-old", channel: "MOBILE", revokedAt: null, expiresAt: daysAgo(35) },
        })
        await prismaTest.authToken.create({
            data: { userId: user.id, token: "expired-recent", channel: "MOBILE", revokedAt: null, expiresAt: daysAgo(5) },
        })
        await prismaTest.authToken.create({
            data: { userId: user.id, token: "still-valid", channel: "MOBILE", revokedAt: null, expiresAt: daysFromNow(60) },
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
            data: { userId: user.id, token: "used-old", expiresAt: daysFromNow(1), usedAt: daysAgo(35) },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "used-recent", expiresAt: daysFromNow(1), usedAt: daysAgo(5) },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "expired-old", expiresAt: daysAgo(35), usedAt: null },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "expired-recent", expiresAt: daysAgo(5), usedAt: null },
        })
        await prismaTest.passwordReset.create({
            data: { userId: user.id, token: "still-valid", expiresAt: daysFromNow(1), usedAt: null },
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
        const hash = (s: string) => require("crypto").createHash("sha256").update(s).digest("hex")

        await prismaTest.refreshToken.create({
            data: { userId: user.id, token: hash("revoked-old"), expiresAt: daysFromNow(7), revokedAt: daysAgo(35) },
        })
        await prismaTest.refreshToken.create({
            data: { userId: user.id, token: hash("revoked-recent"), expiresAt: daysFromNow(7), revokedAt: daysAgo(5) },
        })
        await prismaTest.refreshToken.create({
            data: { userId: user.id, token: hash("expired-old"), expiresAt: daysAgo(35), revokedAt: null },
        })
        await prismaTest.refreshToken.create({
            data: { userId: user.id, token: hash("still-valid"), expiresAt: daysFromNow(7), revokedAt: null },
        })

        const summary = await retentionService.purgeExpiredData()

        expect(summary.refreshTokensDeleted).toBe(2)

        const remaining = await prismaTest.refreshToken.findMany()
        expect(remaining).toHaveLength(2)
    })

    it("não expurga nada quando não há dados elegíveis", async () => {
        const summary = await retentionService.purgeExpiredData()

        expect(summary).toEqual({
            authTokensDeleted: 0,
            passwordResetsDeleted: 0,
            auditLogsDeleted: 0,
            refreshTokensDeleted: 0,
        })
    })
})
