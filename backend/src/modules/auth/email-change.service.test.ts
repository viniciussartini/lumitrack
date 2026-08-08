import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { EmailChangeService } from "@/modules/auth/email-change.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuthService } from "@/modules/auth/auth.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { BadRequestError, ConflictError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const mockSendEmailChangeConfirmation = vi.fn().mockResolvedValue(undefined)
const mockSendEmailChangedNotice = vi.fn().mockResolvedValue(undefined)
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined)

const authRepository = new AuthRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)

let emailChangeService: EmailChangeService

// authService só é usado para logar de verdade e obter uma sessão real a
// revogar — não é o objeto sob teste neste arquivo.
const authService = new AuthService(authRepository, mockSendPasswordResetEmail)

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

async function createUserAndGetId(): Promise<string> {
    const userService = new UserService(userRepository)
    const user = await userService.createUser(validUser)
    return user.id
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
    vi.clearAllMocks()
    emailChangeService = new EmailChangeService(
        authRepository,
        mockSendEmailChangeConfirmation,
        mockSendEmailChangedNotice,
    )
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────

describe("EmailChangeService", () => {
    describe("requestChange", () => {
        it("persiste o hash do token, nunca o valor puro", async () => {
            const userId = await createUserAndGetId()

            await emailChangeService.requestChange({
                userId,
                oldEmail: "joao@example.com",
                newEmail: "novo@example.com",
            })

            const rawToken = mockSendEmailChangeConfirmation.mock.calls[0]?.[1] as string
            expect(rawToken).toBeDefined()

            const stored = await prismaTest.emailChange.findFirst({ where: { userId } })
            expect(stored?.newEmail).toBe("novo@example.com")
            expect(stored?.token).toBe(hashToken(rawToken))
            expect(stored?.token).not.toBe(rawToken)
        })

        it("chama as duas funções de e-mail com os endereços certos", async () => {
            const userId = await createUserAndGetId()

            await emailChangeService.requestChange({
                userId,
                oldEmail: "joao@example.com",
                newEmail: "novo@example.com",
            })

            expect(mockSendEmailChangeConfirmation).toHaveBeenCalledWith(
                "novo@example.com",
                expect.any(String),
            )
            expect(mockSendEmailChangedNotice).toHaveBeenCalledWith(
                "joao@example.com",
                "novo@example.com",
            )
        })

        it("não derruba o pedido se o aviso ao e-mail antigo falhar (best-effort)", async () => {
            const userId = await createUserAndGetId()
            mockSendEmailChangedNotice.mockRejectedValueOnce(new Error("SMTP fora do ar"))

            await expect(
                emailChangeService.requestChange({
                    userId,
                    oldEmail: "joao@example.com",
                    newEmail: "novo@example.com",
                }),
            ).resolves.not.toThrow()

            // O pedido foi persistido e o e-mail de confirmação (que carrega
            // a funcionalidade) foi enviado mesmo com o aviso falhando.
            const stored = await prismaTest.emailChange.findFirst({ where: { userId } })
            expect(stored).not.toBeNull()
            expect(mockSendEmailChangeConfirmation).toHaveBeenCalledOnce()
        })
    })

    describe("confirmChange", () => {
        async function setupRequest() {
            const userId = await createUserAndGetId()
            await emailChangeService.requestChange({
                userId,
                oldEmail: "joao@example.com",
                newEmail: "novo@example.com",
            })
            const rawToken = mockSendEmailChangeConfirmation.mock.calls[0]?.[1] as string
            return { userId, rawToken }
        }

        it("efetiva o e-mail, marca o pedido como usado e revoga toda sessão do usuário", async () => {
            const { userId, rawToken } = await setupRequest()

            // Sessão real a revogar — mesmo padrão de resetPassword.
            const session = await authService.login({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })
            if (session.mfaRequired) throw new Error("esperava mfaRequired:false")

            const result = await emailChangeService.confirmChange({ token: rawToken })
            expect(result.userId).toBe(userId)

            const user = await prismaTest.user.findUnique({ where: { id: userId } })
            expect(user?.email).toBe("novo@example.com")

            const change = await prismaTest.emailChange.findFirst({ where: { userId } })
            expect(change?.usedAt).not.toBeNull()

            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: hashToken(session.token) },
            })
            expect(storedToken?.revokedAt).not.toBeNull()

            const storedRefresh = await prismaTest.refreshToken.findFirst({
                where: { userId },
            })
            expect(storedRefresh?.revokedAt).not.toBeNull()
        })

        it("lança ValidationError para corpo sem token", async () => {
            await expect(emailChangeService.confirmChange({})).rejects.toThrow(ValidationError)
        })

        it("lança BadRequestError para token inexistente", async () => {
            await expect(
                emailChangeService.confirmChange({ token: "token-que-nao-existe" }),
            ).rejects.toThrow(BadRequestError)
        })

        it("lança BadRequestError (mesma mensagem) para token já usado", async () => {
            const { rawToken } = await setupRequest()

            await emailChangeService.confirmChange({ token: rawToken })

            let messageNotFound: string | undefined
            let messageUsed: string | undefined
            try {
                await emailChangeService.confirmChange({ token: "token-que-nao-existe" })
            } catch (e) {
                if (e instanceof BadRequestError) messageNotFound = e.message
            }
            try {
                await emailChangeService.confirmChange({ token: rawToken })
            } catch (e) {
                if (e instanceof BadRequestError) messageUsed = e.message
            }

            expect(messageUsed).toBeDefined()
            expect(messageUsed).toBe(messageNotFound)
        })

        it("lança BadRequestError para token expirado", async () => {
            const userId = await createUserAndGetId()
            const expiredToken = "token-expirado-para-teste"

            await prismaTest.emailChange.create({
                data: {
                    userId,
                    newEmail: "novo@example.com",
                    token: hashToken(expiredToken),
                    expiresAt: new Date(Date.now() - 1000), // já expirado
                },
            })

            await expect(emailChangeService.confirmChange({ token: expiredToken })).rejects.toThrow(
                BadRequestError,
            )
        })

        it("lança ConflictError se outra conta já tiver tomado o e-mail alvo", async () => {
            const { rawToken } = await setupRequest()

            // Outra conta cadastra o mesmo e-mail-alvo depois do pedido, mas
            // antes da confirmação.
            const userService = new UserService(userRepository)
            await userService.createUser({
                email: "novo@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL",
                acceptedTerms: true,
                firstName: "Outra",
                lastName: "Pessoa",
                cpf: "310.037.856-38",
            })

            await expect(emailChangeService.confirmChange({ token: rawToken })).rejects.toThrow(
                ConflictError,
            )
        })
    })
})
