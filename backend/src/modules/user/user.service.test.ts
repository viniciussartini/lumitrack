import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// Instanciamos as dependências reais — sem mocks.
// O repository usa o prismaTest (banco lumitrack_test),
// e o service recebe o repository por injeção de dependência.
//
// Injeção de dependência aqui funciona como uma tomada elétrica:
// o service não sabe (nem precisa saber) se a "energia" vem da
// tomada de produção ou da de testes — ele só usa a interface.
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validIndividualInput = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25", // CPF válido para testes
}

const validCompanyInput = {
    email: "contato@empresa.com",
    password: "Senha@123",
    userType: "COMPANY" as const,
    companyName: "Empresa Ltda",
    cnpj: "11.222.333/0001-81", // CNPJ válido para testes
    tradeName: "Empresa",
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

// Antes de CADA teste: limpa o banco para garantir isolamento total.
// É como lavar a lousa antes de cada aula — cada teste começa do zero.
beforeEach(async () => {
    await cleanDatabase()
})

// Após TODOS os testes do arquivo: encerra a conexão com o banco.
// Sem isso, o Vitest ficaria aguardando a conexão fechar indefinidamente.
afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: createUser
// ─────────────────────────────────────────────────────────────────────────────

describe("UserService", () => {
    describe("createUser", () => {

        // ── Caminho feliz: pessoa física ─────────────────────────────────────────

        it("deve criar um usuário pessoa física com dados válidos", async () => {
            const user = await userService.createUser(validIndividualInput)

            expect(user.id).toBeDefined()
            expect(user.email).toBe("joao@example.com")
            expect(user.userType).toBe("INDIVIDUAL")
            expect(user.firstName).toBe("João")
            expect(user.lastName).toBe("Silva")
            // A senha NUNCA deve ser retornada — nem mesmo o hash.
            // Expor o hash permite ataques offline de força bruta.
            expect(user).not.toHaveProperty("password")
        })

        it("deve criar um usuário pessoa jurídica com dados válidos", async () => {
            const user = await userService.createUser(validCompanyInput)

            expect(user.id).toBeDefined()
            expect(user.email).toBe("contato@empresa.com")
            expect(user.userType).toBe("COMPANY")
            expect(user.companyName).toBe("Empresa Ltda")
            expect(user.cnpj).toBeDefined()
            expect(user).not.toHaveProperty("password")
        })

        it("deve armazenar a senha como hash bcrypt, nunca em texto puro", async () => {
            await userService.createUser(validIndividualInput)

            // Buscamos diretamente no banco para verificar o hash real armazenado.
            // O service não retorna a senha — então precisamos ir ao banco.
            const userInDb = await prismaTest.user.findUnique({
                where: { email: "joao@example.com" },
            })

            expect(userInDb?.password).toBeDefined()
            // Hash bcrypt sempre começa com $2b$ ou $2a$
            expect(userInDb?.password).toMatch(/^\$2[ab]\$/)
            // E jamais é a senha original
            expect(userInDb?.password).not.toBe("Senha@123")
        })

        // ── Conflitos de unicidade ───────────────────────────────────────────────

        it("deve lançar ConflictError ao tentar cadastrar e-mail já existente", async () => {
            await userService.createUser(validIndividualInput)

            await expect(
                userService.createUser({
                ...validIndividualInput,
                cpf: "310.037.856-38", // CPF diferente, mas mesmo e-mail
                }),
            ).rejects.toThrow(ConflictError)
        })

        it("deve lançar ConflictError ao tentar cadastrar CPF já existente", async () => {
            await userService.createUser(validIndividualInput)

            await expect(
                userService.createUser({
                ...validIndividualInput,
                email: "outro@example.com", // E-mail diferente, mas mesmo CPF
                }),
            ).rejects.toThrow(ConflictError)
        })

        it("deve lançar ConflictError ao tentar cadastrar CNPJ já existente", async () => {
            await userService.createUser(validCompanyInput)

            await expect(
                userService.createUser({
                ...validCompanyInput,
                email: "outro@empresa.com", // E-mail diferente, mas mesmo CNPJ
                }),
            ).rejects.toThrow(ConflictError)
        })

        // ── Validações de campos obrigatórios ────────────────────────────────────

        it("deve lançar ValidationError quando pessoa física não informar CPF", async () => {
        await expect(
                userService.createUser({
                email: "sem-cpf@example.com",
                password: "Senha@123",
                userType: "INDIVIDUAL" as const,
                firstName: "João",
                lastName: "Silva",
                // cpf ausente intencionalmente
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError quando pessoa jurídica não informar CNPJ", async () => {
            await expect(
                userService.createUser({
                email: "sem-cnpj@empresa.com",
                password: "Senha@123",
                userType: "COMPANY" as const,
                companyName: "Empresa Ltda",
                // cnpj ausente intencionalmente
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para e-mail com formato inválido", async () => {
            await expect(
                userService.createUser({
                ...validIndividualInput,
                email: "email-invalido",
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para senha fraca (menos de 8 caracteres)", async () => {
            await expect(
                userService.createUser({
                ...validIndividualInput,
                password: "123",
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: findById
    // ─────────────────────────────────────────────────────────────────────────

    describe("findById", () => {
        it("deve retornar o usuário pelo ID sem expor a senha", async () => {
            const created = await userService.createUser(validIndividualInput)

            const found = await userService.findById(created.id)

            expect(found.id).toBe(created.id)
            expect(found.email).toBe("joao@example.com")
            expect(found).not.toHaveProperty("password")
        })

        it("deve lançar NotFoundError para ID inexistente", async () => {
            await expect(
                userService.findById("00000000-0000-0000-0000-000000000000"),
            ).rejects.toThrow(NotFoundError)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: updateUser
    // ─────────────────────────────────────────────────────────────────────────

    describe("updateUser", () => {
        it("deve atualizar o nome de um usuário pessoa física", async () => {
            const created = await userService.createUser(validIndividualInput)

            const updated = await userService.updateUser(created.id, {
                firstName: "Carlos",
                lastName: "Souza",
            })

            expect(updated.firstName).toBe("Carlos")
            expect(updated.lastName).toBe("Souza")
            expect(updated.email).toBe("joao@example.com") // não mudou
        })

        it("deve lançar NotFoundError ao tentar atualizar usuário inexistente", async () => {
            await expect(
                userService.updateUser("00000000-0000-0000-0000-000000000000", {
                firstName: "Carlos",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("não deve permitir atualização de e-mail para um já existente", async () => {
            await userService.createUser(validIndividualInput)
            const second = await userService.createUser({
                ...validCompanyInput,
                email: "segundo@example.com",
            })

            await expect(
                userService.updateUser(second.id, {
                email: "joao@example.com", // e-mail já pertence ao primeiro usuário
                }),
            ).rejects.toThrow(ConflictError)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: deleteUser
    // ─────────────────────────────────────────────────────────────────────────

    describe("deleteUser", () => {
        it("deve deletar um usuário existente", async () => {
            const created = await userService.createUser(validIndividualInput)

            await userService.deleteUser(created.id)

            // Após deletar, findById deve lançar NotFoundError
            await expect(
                userService.findById(created.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar usuário inexistente", async () => {
            await expect(
                userService.deleteUser("00000000-0000-0000-0000-000000000000"),
            ).rejects.toThrow(NotFoundError)
        })
    })
})