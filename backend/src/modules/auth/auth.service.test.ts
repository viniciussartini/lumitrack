import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { AuthService } from "@/modules/auth/auth.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { UnauthorizedError, BadRequestError } from "@/shared/errors/AppError.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"
import { generate } from "otplib"

// ─── Instâncias ───────────────────────────────────────────────────────────────
// O AuthService recebe duas dependências por injeção:
//   1. AuthRepository — para tokens e resets
//   2. EmailService   — para enviar e-mails (usaremos um mock aqui)
//
// O EmailService é mockado porque testes não devem disparar e-mails reais.
// Analogia: quando você testa o freio de um carro, não precisa sair na estrada
// — você usa uma bancada de testes. O mock é essa bancada para o e-mail.

const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined)

const authRepository = new AuthRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)

// O AuthService será instanciado com o mock de e-mail — detalhes na criação do service.
let authService: AuthService

// Helper: chama login() e estreita o tipo do union para uma sessão completa
// (mfaRequired:false) — os usuários deste arquivo nunca têm MFA habilitado,
// então isso nunca deveria de fato lançar; o guard serve para o TypeScript
// (login() retorna `{mfaRequired:true,mfaToken}|{mfaRequired:false,...}`).
async function loginAsSession(input: unknown) {
    const result = await authService.login(input)
    if (result.mfaRequired) {
        throw new Error("login inesperadamente exigiu MFA neste teste")
    }
    return result
}

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

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
    vi.clearAllMocks() // reseta contadores e retornos de todos os mocks
    authService = new AuthService(authRepository, mockSendPasswordResetEmail)
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: login
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
    describe("login", () => {

        it("deve retornar um token JWT ao fazer login com credenciais válidas (WEB)", async () => {
            // Arrange: criamos o usuário diretamente pelo repository (mais rápido que o service)
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            // Act
            const result = await loginAsSession({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            // Assert
            expect(result.token).toBeDefined()
            expect(typeof result.token).toBe("string")
            // Um JWT tem exatamente três partes separadas por ponto
            expect(result.token.split(".")).toHaveLength(3)
        })

        it("deve persistir o HASH do token (não o JWT puro) na tabela auth_tokens após login WEB", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const result = await loginAsSession({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            // O JWT puro NUNCA é persistido — apenas seu hash
            const storedRaw = await prismaTest.authToken.findUnique({
                where: { token: result.token },
            })
            expect(storedRaw).toBeNull()

            // O token deve existir no banco pelo hash — não apenas na memória
            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: hashToken(result.token) },
            })

            expect(storedToken).not.toBeNull()
            expect(storedToken?.channel).toBe("WEB")
            // Para WEB, expiresAt deve estar preenchido
            expect(storedToken?.expiresAt).not.toBeNull()
            // E ainda não foi revogado
            expect(storedToken?.revokedAt).toBeNull()
        })

        it("deve persistir token MOBILE com expiresAt preenchido (token vazado não dura para sempre)", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const beforeLogin = Date.now()
            const result = await loginAsSession({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "MOBILE",
            })

            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: hashToken(result.token) },
            })

            expect(storedToken?.channel).toBe("MOBILE")
            // Para MOBILE, expiresAt agora é preenchido (default 90 dias) —
            // um token vazado não tem mais validade indefinida.
            expect(storedToken?.expiresAt).not.toBeNull()
            expect(storedToken!.expiresAt!.getTime()).toBeGreaterThan(beforeLogin)
        })

        it("deve lançar UnauthorizedError para e-mail inexistente", async () => {
            await expect(
                authService.login({
                    email: "naoexiste@example.com",
                    password: "Senha@123",
                    channel: "WEB",
                }),
            ).rejects.toThrow(UnauthorizedError)
        })

        it("deve lançar UnauthorizedError para senha incorreta", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            await expect(
                authService.login({
                    email: "joao@example.com",
                    password: "SenhaErrada@123",
                    channel: "WEB",
                }),
            ).rejects.toThrow(UnauthorizedError)
        })

        it("deve retornar a mesma mensagem de erro para e-mail inexistente e senha errada", async () => {
            // Este teste verifica uma propriedade de segurança importante:
            // o sistema não deve revelar se o e-mail existe ou não.
            // Analogia: um cofre bom não diz "número errado" nem "sequência errada"
            // — ele só diz "acesso negado".
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            let errorMessageWrongEmail: string | undefined
            let errorMessageWrongPassword: string | undefined

            try {
                await authService.login({
                    email: "naoexiste@example.com",
                    password: "Senha@123",
                    channel: "WEB",
                })
            } catch (e) {
                if (e instanceof UnauthorizedError) errorMessageWrongEmail = e.message
            }

            try {
                await authService.login({
                    email: "joao@example.com",
                    password: "SenhaErrada@123",
                    channel: "WEB",
                })
            } catch (e) {
                if (e instanceof UnauthorizedError) errorMessageWrongPassword = e.message
            }

            expect(errorMessageWrongEmail).toBe(errorMessageWrongPassword)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: logout
    // ─────────────────────────────────────────────────────────────────────────

    describe("logout", () => {
        it("deve revogar o token preenchendo revokedAt", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const { token } = await loginAsSession({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            await authService.logout(token)

            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: hashToken(token) },
            })

            expect(storedToken?.revokedAt).not.toBeNull()
        })

        it("deve lançar UnauthorizedError ao tentar fazer logout com token inexistente", async () => {
            await expect(
                authService.logout("token.inexistente.qualquer"),
            ).rejects.toThrow(UnauthorizedError)
        })

        it("deve lançar UnauthorizedError ao tentar revogar token já revogado", async () => {
            // Isso previne que o mesmo token seja "deslogado" duas vezes — embora
            // não seja um risco crítico, é uma boa prática de consistência.
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const { token } = await loginAsSession({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            await authService.logout(token) // primeiro logout — ok

            await expect(
                authService.logout(token), // segundo logout — deve falhar
            ).rejects.toThrow(UnauthorizedError)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: forgotPassword
    // ─────────────────────────────────────────────────────────────────────────

    describe("forgotPassword", () => {
        it("deve criar um PasswordReset e chamar o serviço de e-mail para e-mail existente", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            await authService.forgotPassword({ email: "joao@example.com" })

            // Verificamos que o registro foi criado no banco
            const reset = await prismaTest.passwordReset.findFirst({
                where: { user: { email: "joao@example.com" } },
            })

            expect(reset).not.toBeNull()
            expect(reset?.usedAt).toBeNull()
            expect(reset?.expiresAt.getTime()).toBeGreaterThan(Date.now())

            // E que o serviço de e-mail foi chamado uma vez com o e-mail correto
            expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1)
            expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
                "joao@example.com",
                expect.any(String), // o token UUID — não sabemos o valor exato
            )
        })

        it("deve retornar sem erro para e-mail inexistente (user enumeration prevention)", async () => {
            // O serviço NUNCA deve lançar erro para e-mail não cadastrado.
            // Isso é crítico: se retornasse erro, um atacante poderia testar
            // e-mails em massa para descobrir quais estão cadastrados.
            await expect(
                authService.forgotPassword({ email: "fantasma@example.com" }),
            ).resolves.not.toThrow()

            // E o serviço de e-mail NÃO deve ter sido chamado
            expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
        })

        it("não deve criar PasswordReset nem enviar e-mail para uma conta de demonstração", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser({
                ...validUser,
                email: DEMO_RESIDENTIAL_EMAIL,
                cpf: "912.345.678-73",
            })

            await expect(
                authService.forgotPassword({ email: DEMO_RESIDENTIAL_EMAIL }),
            ).resolves.not.toThrow()

            const reset = await prismaTest.passwordReset.findFirst({
                where: { user: { email: DEMO_RESIDENTIAL_EMAIL } },
            })
            expect(reset).toBeNull()
            expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: resetPassword
    // ─────────────────────────────────────────────────────────────────────────

    describe("resetPassword", () => {
        // Helper: executa o fluxo de forgot→reset para reutilizar nos testes
        async function setupReset() {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            await authService.forgotPassword({ email: "joao@example.com" })

            // Capturamos o token gerado pelo forgotPassword via mock
            const resetToken = mockSendPasswordResetEmail.mock.calls[0]?.[1] as string
            return resetToken
        }

        it("deve alterar a senha e marcar o token como usado", async () => {
            const resetToken = await setupReset()

            await authService.resetPassword({
                token: resetToken,
                newPassword: "NovaSenha@456",
            })

            // O registro de reset deve estar marcado como usado
            const reset = await prismaTest.passwordReset.findFirst({
                where: { token: resetToken },
            })
            expect(reset?.usedAt).not.toBeNull()

            // E o usuário deve conseguir fazer login com a nova senha
            const loginResult = await loginAsSession({
                email: "joao@example.com",
                password: "NovaSenha@456",
                channel: "WEB",
            })
            expect(loginResult.token).toBeDefined()
        })

        it("deve lançar BadRequestError para token inexistente", async () => {
            await expect(
                authService.resetPassword({
                    token: "token-que-nao-existe",
                    newPassword: "NovaSenha@456",
                }),
            ).rejects.toThrow(BadRequestError)
        })

        it("deve lançar BadRequestError para token já utilizado", async () => {
            const resetToken = await setupReset()

            // Primeiro uso — ok
            await authService.resetPassword({
                token: resetToken,
                newPassword: "NovaSenha@456",
            })

            // Segundo uso — deve falhar
            await expect(
                authService.resetPassword({
                    token: resetToken,
                    newPassword: "OutraSenha@789",
                }),
            ).rejects.toThrow(BadRequestError)
        })

        it("deve lançar BadRequestError para token expirado", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            // Criamos manualmente um token já expirado (expiresAt no passado)
            const expiredToken = "token-expirado-para-teste"
            const user = await prismaTest.user.findUnique({
                where: { email: "joao@example.com" },
            })

            await prismaTest.passwordReset.create({
                data: {
                    userId: user!.id,
                    token: expiredToken,
                    expiresAt: new Date(Date.now() - 1000), // 1 segundo no passado
                },
            })

            await expect(
                authService.resetPassword({
                    token: expiredToken,
                    newPassword: "NovaSenha@456",
                }),
            ).rejects.toThrow(BadRequestError)
        })

        it("não deve aceitar nova senha que não atenda aos requisitos de força", async () => {
            const resetToken = await setupReset()

            await expect(
                authService.resetPassword({
                    token: resetToken,
                    newPassword: "fraca",
                }),
            ).rejects.toThrow()
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: MFA (#12 — A06/A07)
    // ─────────────────────────────────────────────────────────────────────────

    // Timeout maior que o default (5000ms) para todo o bloco — habilitar o
    // MFA hasheia 10 backup codes via bcrypt (BCRYPT_ROUNDS=12, ~100-300ms
    // cada) e alguns testes ainda comparam contra eles na desabilitação/
    // segundo fator do login, o que facilmente passa de 2-3s mesmo em
    // hardware razoável.
    describe("MFA", { timeout: 15000 }, () => {
        async function createUserAndGetId(): Promise<string> {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            const user = await userService.createUser(validUser)
            return user.id
        }

        // Habilita o MFA de ponta a ponta (setup → verify) e devolve o
        // secret em texto claro + os backup codes — reaproveitado pelos
        // testes de login/disable, que precisam gerar códigos válidos.
        async function enableMfaForUser(userId: string) {
            const { secret } = await authService.setupMfa(validUser.email)
            const code = await generate({ secret })
            const { backupCodes } = await authService.verifyMfaSetup(userId, { secret, code })
            return { secret, backupCodes }
        }

        describe("setupMfa", () => {
            it("gera um secret e um QR code, sem persistir nada ainda", async () => {
                const userId = await createUserAndGetId()

                const result = await authService.setupMfa(validUser.email)

                expect(result.secret).toBeTruthy()
                expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(false)
                expect(user?.mfaSecret).toBeNull()
            })
        })

        describe("verifyMfaSetup", () => {
            it("habilita o MFA e retorna backup codes quando o código é válido", async () => {
                const userId = await createUserAndGetId()
                const { secret } = await authService.setupMfa(validUser.email)
                const code = await generate({ secret })

                const result = await authService.verifyMfaSetup(userId, { secret, code })

                expect(result.backupCodes).toHaveLength(10)
                // Cada backup code é único
                expect(new Set(result.backupCodes).size).toBe(10)

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(true)
                expect(user?.mfaSecret).not.toBeNull()
                // O secret nunca é persistido em texto claro
                expect(user?.mfaSecret).not.toBe(secret)

                const storedCodes = await prismaTest.mfaBackupCode.findMany({ where: { userId } })
                expect(storedCodes).toHaveLength(10)
                expect(storedCodes.every((c) => c.usedAt === null)).toBe(true)
            })

            it("lança UnauthorizedError e não persiste nada para código inválido", async () => {
                const userId = await createUserAndGetId()
                const { secret } = await authService.setupMfa(validUser.email)

                await expect(
                    authService.verifyMfaSetup(userId, { secret, code: "000000" }),
                ).rejects.toThrow(UnauthorizedError)

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(false)
            })
        })

        describe("login com MFA habilitado", () => {
            it("retorna mfaRequired:true em vez de uma sessão, sem persistir AuthToken", async () => {
                const userId = await createUserAndGetId()
                await enableMfaForUser(userId)

                const result = await authService.login({
                    email: validUser.email,
                    password: validUser.password,
                    channel: "WEB",
                })

                expect(result.mfaRequired).toBe(true)
                if (!result.mfaRequired) throw new Error("esperava mfaRequired:true")
                expect(result.mfaToken).toBeTruthy()

                const tokens = await prismaTest.authToken.findMany({ where: { userId } })
                expect(tokens).toHaveLength(0)
            })

            it("continua lançando UnauthorizedError para senha errada antes de chegar no MFA", async () => {
                const userId = await createUserAndGetId()
                await enableMfaForUser(userId)

                await expect(
                    authService.login({
                        email: validUser.email,
                        password: "SenhaErrada@123",
                        channel: "WEB",
                    }),
                ).rejects.toThrow(UnauthorizedError)
            })
        })

        describe("completeMfaLogin", () => {
            async function getMfaToken(): Promise<{ userId: string; mfaToken: string; secret: string; backupCodes: string[] }> {
                const userId = await createUserAndGetId()
                const { secret, backupCodes } = await enableMfaForUser(userId)

                const result = await authService.login({
                    email: validUser.email,
                    password: validUser.password,
                    channel: "WEB",
                })
                if (!result.mfaRequired) throw new Error("esperava mfaRequired:true")

                return { userId, mfaToken: result.mfaToken, secret, backupCodes }
            }

            it("completa o login com um código TOTP válido e persiste a sessão", async () => {
                const { userId, mfaToken, secret } = await getMfaToken()
                const code = await generate({ secret })

                const session = await authService.completeMfaLogin({ mfaToken, code })

                expect(session.token).toBeTruthy()
                expect(session.channel).toBe("WEB")
                expect(session.userId).toBe(userId)

                const tokens = await prismaTest.authToken.findMany({ where: { userId } })
                expect(tokens).toHaveLength(1)
            })

            it("completa o login com um backup code válido e o marca como usado", async () => {
                const { userId, mfaToken, backupCodes } = await getMfaToken()
                const backupCode = backupCodes[0]!

                const session = await authService.completeMfaLogin({ mfaToken, code: backupCode })

                expect(session.token).toBeTruthy()

                // Exatamente 1 dos 10 backup codes foi consumido — os
                // outros 9 continuam disponíveis para uso futuro.
                const allCodes = await prismaTest.mfaBackupCode.findMany({ where: { userId } })
                const usedCodes = allCodes.filter((c) => c.usedAt !== null)
                expect(usedCodes).toHaveLength(1)
                expect(allCodes).toHaveLength(10)
            })

            it("lança UnauthorizedError para código inválido", async () => {
                const { mfaToken } = await getMfaToken()

                await expect(
                    authService.completeMfaLogin({ mfaToken, code: "000000" }),
                ).rejects.toThrow(UnauthorizedError)
            })

            it("lança UnauthorizedError para mfaToken inválido", async () => {
                await expect(
                    authService.completeMfaLogin({ mfaToken: "token.invalido.aqui", code: "123456" }),
                ).rejects.toThrow(UnauthorizedError)
            })

            it("não permite reutilizar o mesmo backup code duas vezes", async () => {
                const { mfaToken, backupCodes } = await getMfaToken()
                const backupCode = backupCodes[0]!

                await authService.completeMfaLogin({ mfaToken, code: backupCode })

                // Mesmo backup code, novo mfaToken (simula uma segunda tentativa de login)
                const secondLogin = await authService.login({
                    email: validUser.email,
                    password: validUser.password,
                    channel: "WEB",
                })
                if (!secondLogin.mfaRequired) throw new Error("esperava mfaRequired:true")

                await expect(
                    authService.completeMfaLogin({ mfaToken: secondLogin.mfaToken, code: backupCode }),
                ).rejects.toThrow(UnauthorizedError)
            })
        })

        describe("disableMfa", () => {
            it("desabilita o MFA e remove os backup codes com senha+código corretos", async () => {
                const userId = await createUserAndGetId()
                const { secret } = await enableMfaForUser(userId)
                const code = await generate({ secret })

                await authService.disableMfa(userId, { password: validUser.password, code })

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(false)
                expect(user?.mfaSecret).toBeNull()

                const remainingCodes = await prismaTest.mfaBackupCode.findMany({ where: { userId } })
                expect(remainingCodes).toHaveLength(0)

                // Login deixa de exigir MFA
                const result = await authService.login({
                    email: validUser.email,
                    password: validUser.password,
                    channel: "WEB",
                })
                expect(result.mfaRequired).toBe(false)
            })

            it("também aceita um backup code válido para desabilitar", async () => {
                const userId = await createUserAndGetId()
                const { backupCodes } = await enableMfaForUser(userId)

                await authService.disableMfa(userId, {
                    password: validUser.password,
                    code: backupCodes[0]!,
                })

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(false)
            })

            it("lança UnauthorizedError para senha incorreta, sem desabilitar o MFA", async () => {
                const userId = await createUserAndGetId()
                const { secret } = await enableMfaForUser(userId)
                const code = await generate({ secret })

                await expect(
                    authService.disableMfa(userId, { password: "SenhaErrada@123", code }),
                ).rejects.toThrow(UnauthorizedError)

                const user = await prismaTest.user.findUnique({ where: { id: userId } })
                expect(user?.mfaEnabled).toBe(true)
            })

            it("lança UnauthorizedError para código incorreto", async () => {
                const userId = await createUserAndGetId()
                await enableMfaForUser(userId)

                await expect(
                    authService.disableMfa(userId, { password: validUser.password, code: "000000" }),
                ).rejects.toThrow(UnauthorizedError)
            })

            it("lança BadRequestError quando o MFA não está habilitado", async () => {
                const userId = await createUserAndGetId()

                await expect(
                    authService.disableMfa(userId, { password: validUser.password, code: "123456" }),
                ).rejects.toThrow(BadRequestError)
            })
        })
    })

    // ─── refresh (#14 — A06) ──────────────────────────────────────────────────
    describe("refresh", () => {
        async function createUserAndLogin() {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)
            const result = await loginAsSession({
                email: validUser.email,
                password: validUser.password,
                channel: "WEB",
            })
            if (!result.refreshToken) throw new Error("refreshToken ausente no login WEB")
            return { sessionToken: result.token, rawRefreshToken: result.refreshToken }
        }

        it("emite novo JWT e novo refresh token, revogando o antigo", async () => {
            const { rawRefreshToken } = await createUserAndLogin()

            const renewed = await authService.refresh(rawRefreshToken)

            expect(renewed.token).toBeDefined()
            expect(renewed.refreshToken).toBeDefined()
            expect(renewed.channel).toBe("WEB")

            // Token antigo deve estar revogado e linkado ao novo
            const oldStored = await prismaTest.refreshToken.findUnique({
                where: { token: hashToken(rawRefreshToken) },
            })
            expect(oldStored?.revokedAt).not.toBeNull()
            expect(oldStored?.replacedByTokenId).not.toBeNull()
        })

        it("token rotacionado não pode ser usado novamente (fora da janela de graça)", async () => {
            const { rawRefreshToken } = await createUserAndLogin()

            // Primeira renovação (válida)
            await authService.refresh(rawRefreshToken)

            // Força revokedAt para muito antes para sair da janela de graça
            await prismaTest.refreshToken.updateMany({
                where: { token: hashToken(rawRefreshToken) },
                data: { revokedAt: new Date(Date.now() - 60_000) },
            })

            // Reuso real: deve revogar tudo e lançar erro
            const auditSpy = vi.fn()
            await expect(authService.refresh(rawRefreshToken, auditSpy)).rejects.toThrow(
                UnauthorizedError,
            )
            // Todas as sessões revogadas
            const all = await prismaTest.refreshToken.findMany()
            expect(all.every((t) => t.revokedAt !== null)).toBe(true)
            // Função de auditoria chamada
            expect(auditSpy).toHaveBeenCalledOnce()
        })

        it("dentro da janela de graça (multi-aba), aceita token recentemente rotacionado sem segunda rotação", async () => {
            const { rawRefreshToken } = await createUserAndLogin()

            // Primeira renovação (normal)
            await authService.refresh(rawRefreshToken)

            // Não move o revokedAt — permanece dentro da janela de graça
            const auditSpy = vi.fn()
            const renewed2 = await authService.refresh(rawRefreshToken, auditSpy)

            expect(renewed2.token).toBeDefined()
            // Auditoria de reuso NÃO deve ter sido chamada
            expect(auditSpy).not.toHaveBeenCalled()
        })

        it("lança UnauthorizedError para token inexistente", async () => {
            await expect(authService.refresh("token-invalido")).rejects.toThrow(UnauthorizedError)
        })

        it("lança UnauthorizedError para token expirado (sem revogação em cascata)", async () => {
            const { rawRefreshToken } = await createUserAndLogin()

            // Move expiresAt para o passado
            await prismaTest.refreshToken.updateMany({
                where: { token: hashToken(rawRefreshToken) },
                data: { expiresAt: new Date(Date.now() - 1000) },
            })

            const auditSpy = vi.fn()
            await expect(authService.refresh(rawRefreshToken, auditSpy)).rejects.toThrow(
                UnauthorizedError,
            )
            // Expiração natural não dispara revogação em cascata
            expect(auditSpy).not.toHaveBeenCalled()
        })

        it("logout revoga também o refresh token quando presente", async () => {
            const { sessionToken, rawRefreshToken } = await createUserAndLogin()

            await authService.logout(sessionToken, rawRefreshToken)

            const refreshStored = await prismaTest.refreshToken.findUnique({
                where: { token: hashToken(rawRefreshToken) },
            })
            expect(refreshStored?.revokedAt).not.toBeNull()
        })

        it("login WEB retorna refreshToken; login MOBILE retorna null", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const webResult = await loginAsSession({
                email: validUser.email,
                password: validUser.password,
                channel: "WEB",
            })
            const mobileResult = await loginAsSession({
                email: validUser.email,
                password: validUser.password,
                channel: "MOBILE",
            })

            expect(webResult.refreshToken).not.toBeNull()
            expect(mobileResult.refreshToken).toBeNull()
        })
    })
})