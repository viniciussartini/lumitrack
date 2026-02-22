import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { AuthService } from "@/modules/auth/auth.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { UnauthorizedError, BadRequestError } from "@/shared/errors/AppError.js"

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

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
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
            const result = await authService.login({
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

        it("deve persistir o token na tabela auth_tokens após login WEB", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const result = await authService.login({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            // O token deve existir no banco — não apenas na memória
            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: result.token },
            })

            expect(storedToken).not.toBeNull()
            expect(storedToken?.channel).toBe("WEB")
            // Para WEB, expiresAt deve estar preenchido
            expect(storedToken?.expiresAt).not.toBeNull()
            // E ainda não foi revogado
            expect(storedToken?.revokedAt).toBeNull()
        })

        it("deve persistir token MOBILE sem expiresAt (mobile não expira)", async () => {
            const { UserService } = await import("@/modules/user/user.service.js")
            const userService = new UserService(userRepository)
            await userService.createUser(validUser)

            const result = await authService.login({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "MOBILE",
            })

            const storedToken = await prismaTest.authToken.findUnique({
                where: { token: result.token },
            })

            expect(storedToken?.channel).toBe("MOBILE")
            // Para MOBILE, expiresAt deve ser null — o token nunca expira por tempo
            expect(storedToken?.expiresAt).toBeNull()
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

            const { token } = await authService.login({
                email: "joao@example.com",
                password: "Senha@123",
                channel: "WEB",
            })

            await authService.logout(token)

            const storedToken = await prismaTest.authToken.findUnique({
                where: { token },
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

            const { token } = await authService.login({
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
            const loginResult = await authService.login({
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
})