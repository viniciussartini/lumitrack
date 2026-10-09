import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { SessionRepository } from "@/modules/session/session.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const repository = new SessionRepository(prismaTest)

const sessionA = "11111111-1111-4111-8111-111111111111"
const sessionB = "22222222-2222-4222-8222-222222222222"
const inOneHour = () => new Date(Date.now() + 3_600_000)

async function createUser(email: string, cpf: string) {
    return prismaTest.user.create({
        data: {
            email,
            password: "hash",
            userType: "INDIVIDUAL",
            firstName: "Nome",
            lastName: "Teste",
            cpf,
            cpfBlindIndex: `idx-${email}`,
            consentedAt: new Date(),
            consentVersion: "1",
        },
    })
}

async function createTokens(userId: string, sessionId: string, suffix: string) {
    await prismaTest.refreshToken.create({
        data: { userId, sessionId, token: `refresh-${suffix}`, expiresAt: inOneHour() },
    })
    await prismaTest.authToken.create({
        data: {
            userId,
            sessionId,
            token: `auth-${suffix}`,
            channel: "WEB",
            expiresAt: inOneHour(),
        },
    })
}

const liveCount = async (userId: string) =>
    (await prismaTest.refreshToken.count({ where: { userId, revokedAt: null } })) +
    (await prismaTest.authToken.count({ where: { userId, revokedAt: null } }))

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("SessionRepository — encerramento", () => {
    it("revokeSession só toca nos tokens do dono, mesmo com o id de sessão de outro usuário", async () => {
        const owner = await createUser("dono@example.com", "529.982.247-25")
        const stranger = await createUser("outro@example.com", "310.037.856-38")
        await createTokens(owner.id, sessionA, "a")

        await repository.revokeSession(stranger.id, sessionA)

        expect(await liveCount(owner.id)).toBe(2)
    })

    it("revokeSession revoga o refresh token e os JWTs de acesso da sessão, e só dela", async () => {
        const user = await createUser("dono@example.com", "529.982.247-25")
        await createTokens(user.id, sessionA, "a")
        await prismaTest.authToken.create({
            data: {
                userId: user.id,
                sessionId: sessionA,
                token: "auth-a-old",
                channel: "WEB",
                expiresAt: inOneHour(),
            },
        })
        await createTokens(user.id, sessionB, "b")

        await repository.revokeSession(user.id, sessionA)

        expect(
            await prismaTest.authToken.count({ where: { sessionId: sessionA, revokedAt: null } }),
        ).toBe(0)
        expect(
            await prismaTest.refreshToken.count({
                where: { sessionId: sessionA, revokedAt: null },
            }),
        ).toBe(0)
        expect(await liveCount(user.id)).toBe(2)
    })

    it("revokeOthers poupa a atual e as sessões de outros usuários, e conta as encerradas", async () => {
        const user = await createUser("dono@example.com", "529.982.247-25")
        const stranger = await createUser("outro@example.com", "310.037.856-38")
        await createTokens(user.id, sessionA, "a")
        await createTokens(user.id, sessionB, "b")
        await createTokens(stranger.id, "33333333-3333-4333-8333-333333333333", "c")

        const revoked = await repository.revokeOthers(user.id, sessionA, new Date())

        expect(revoked).toBe(1)
        expect(
            await prismaTest.refreshToken.count({
                where: { sessionId: sessionA, revokedAt: null },
            }),
        ).toBe(1)
        expect(await liveCount(stranger.id)).toBe(2)
    })
})
