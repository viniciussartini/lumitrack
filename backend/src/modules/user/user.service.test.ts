import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"
import { decrypt } from "@/shared/crypto/encryption.js"

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
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25", // CPF válido para testes
}

const validCompanyInput = {
    email: "contato@empresa.com",
    password: "Senha@123",
    userType: "COMPANY" as const,
    acceptedTerms: true,
    companyName: "Empresa Ltda",
    cnpj: "11.222.333/0001-81", // CNPJ válido para testes
    tradeName: "Empresa",
}

const validDemoInput = {
    ...validIndividualInput,
    email: DEMO_RESIDENTIAL_EMAIL,
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

        // O controle de cifra (A04/Art. 46) já existe em user.repository.ts
        // desde a introdução de encryption.ts; este teste lê a coluna direto
        // e confirma que o valor em repouso não é o texto claro, mesmo
        // padrão do teste acima para a senha (hash bcrypt).
        it("armazena CPF cifrado em repouso, nunca em texto claro", async () => {
            await userService.createUser(validIndividualInput)

            const userInDb = await prismaTest.user.findUniqueOrThrow({
                where: { email: "joao@example.com" },
            })

            expect(userInDb.cpf).toBeDefined()
            expect(userInDb.cpf).not.toBe(validIndividualInput.cpf)
            // Decifra de volta pro valor original — confirma que é um
            // ciphertext válido do CPF certo, não só um valor diferente.
            expect(decrypt(userInDb.cpf!)).toBe(validIndividualInput.cpf)
        })

        it("armazena CNPJ cifrado em repouso, nunca em texto claro", async () => {
            await userService.createUser(validCompanyInput)

            const userInDb = await prismaTest.user.findUniqueOrThrow({
                where: { email: "contato@empresa.com" },
            })

            expect(userInDb.cnpj).toBeDefined()
            expect(userInDb.cnpj).not.toBe(validCompanyInput.cnpj)
            expect(decrypt(userInDb.cnpj!)).toBe(validCompanyInput.cnpj)
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

        // A mensagem não pode distinguir qual dos 3 documentos colidiu,
        // senão um visitante consegue sondar, um por um, se um
        // e-mail/CPF/CNPJ específico já tem conta cadastrada.
        it("deve usar a mesma mensagem genérica para os 3 conflitos de unicidade", async () => {
            await userService.createUser(validIndividualInput)
            await userService.createUser(validCompanyInput)

            let emailMessage: string | undefined
            let cpfMessage: string | undefined
            let cnpjMessage: string | undefined

            try {
                await userService.createUser({ ...validIndividualInput, cpf: "310.037.856-38" })
            } catch (e) {
                if (e instanceof ConflictError) emailMessage = e.message
            }
            try {
                await userService.createUser({
                    ...validIndividualInput,
                    email: "outro@example.com",
                })
            } catch (e) {
                if (e instanceof ConflictError) cpfMessage = e.message
            }
            try {
                await userService.createUser({ ...validCompanyInput, email: "outro@empresa.com" })
            } catch (e) {
                if (e instanceof ConflictError) cnpjMessage = e.message
            }

            expect(emailMessage).toBeDefined()
            expect(emailMessage).toBe(cpfMessage)
            expect(emailMessage).toBe(cnpjMessage)
        })

        // ── Validações de campos obrigatórios ────────────────────────────────────

        it("deve lançar ValidationError quando pessoa física não informar CPF", async () => {
            await expect(
                userService.createUser({
                    email: "sem-cpf@example.com",
                    password: "Senha@123",
                    userType: "INDIVIDUAL" as const,
                    acceptedTerms: true,
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
                    acceptedTerms: true,
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
    // SUITE: createUser — REGISTRATION_ENABLED (ADR-0008)
    // ─────────────────────────────────────────────────────────────────────────

    describe("createUser com cadastro público desabilitado", () => {
        const userServiceRegistrationDisabled = new UserService(userRepository, false)

        it("deve lançar ForbiddenError antes de validar o payload", async () => {
            await expect(
                userServiceRegistrationDisabled.createUser(validIndividualInput),
            ).rejects.toThrow(ForbiddenError)
        })

        it("não deve persistir nenhum usuário quando a flag está desligada", async () => {
            await expect(
                userServiceRegistrationDisabled.createUser(validIndividualInput),
            ).rejects.toThrow(ForbiddenError)

            const created = await userRepository.findByEmail(validIndividualInput.email)
            expect(created).toBeNull()
        })

        it("não afeta uma instância de UserService com a flag ligada (default)", async () => {
            const user = await userService.createUser(validIndividualInput)
            expect(user.id).toBeDefined()
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
                    currentPassword: validCompanyInput.password,
                }),
            ).rejects.toThrow(ConflictError)
        })

        // Sem este guard (ADR-0008), uma sessão na conta demo poderia
        // trocar o e-mail e sequestrá-la permanentemente.
        it("deve lançar ForbiddenError ao tentar atualizar uma conta de demonstração", async () => {
            const demo = await userService.createUser(validDemoInput)

            await expect(
                userService.updateUser(demo.id, { firstName: "Outro Nome" }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("não deve alterar nenhum campo da conta demo quando o guard recusa", async () => {
            const demo = await userService.createUser(validDemoInput)

            await expect(
                userService.updateUser(demo.id, { firstName: "Outro Nome" }),
            ).rejects.toThrow(ForbiddenError)

            const stillOriginal = await userService.findById(demo.id)
            expect(stillOriginal.firstName).toBe(validIndividualInput.firstName)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE: updateUser — troca de e-mail
    // ─────────────────────────────────────────────────────────────────────────

    describe("updateUser — troca de e-mail", () => {
        it("deve lançar ValidationError quando o e-mail muda sem currentPassword", async () => {
            const created = await userService.createUser(validIndividualInput)

            await expect(
                userService.updateUser(created.id, { email: "novo@example.com" }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar UnauthorizedError para currentPassword incorreto", async () => {
            const created = await userService.createUser(validIndividualInput)

            await expect(
                userService.updateUser(created.id, {
                    email: "novo@example.com",
                    currentPassword: "SenhaErrada@123",
                }),
            ).rejects.toThrow(UnauthorizedError)
        })

        it("com senha correta, chama requestEmailChange e NÃO persiste o e-mail imediatamente", async () => {
            const mockRequestEmailChange = vi.fn().mockResolvedValue(undefined)
            const serviceWithEmailChange = new UserService(
                userRepository,
                true,
                mockRequestEmailChange,
            )
            const created = await serviceWithEmailChange.createUser(validIndividualInput)

            const result = await serviceWithEmailChange.updateUser(created.id, {
                email: "novo@example.com",
                currentPassword: validIndividualInput.password,
            })

            expect(mockRequestEmailChange).toHaveBeenCalledWith({
                userId: created.id,
                oldEmail: "joao@example.com",
                newEmail: "novo@example.com",
            })
            // O retorno ainda traz o e-mail ANTIGO — a troca só vale após
            // confirmação pelo novo endereço.
            expect(result.email).toBe("joao@example.com")

            const fromDb = await serviceWithEmailChange.findById(created.id)
            expect(fromDb.email).toBe("joao@example.com")
        })

        it("persiste outros campos junto, mesmo quando o e-mail está em transição", async () => {
            const mockRequestEmailChange = vi.fn().mockResolvedValue(undefined)
            const serviceWithEmailChange = new UserService(
                userRepository,
                true,
                mockRequestEmailChange,
            )
            const created = await serviceWithEmailChange.createUser(validIndividualInput)

            const result = await serviceWithEmailChange.updateUser(created.id, {
                email: "novo@example.com",
                currentPassword: validIndividualInput.password,
                firstName: "Carlos",
            })

            expect(result.firstName).toBe("Carlos")
            expect(result.email).toBe("joao@example.com")
        })

        it("deve lançar ConflictError se o e-mail alvo já existir — verificado depois da senha", async () => {
            const mockRequestEmailChange = vi.fn().mockResolvedValue(undefined)
            const serviceWithEmailChange = new UserService(
                userRepository,
                true,
                mockRequestEmailChange,
            )
            await serviceWithEmailChange.createUser(validIndividualInput)
            const second = await serviceWithEmailChange.createUser({
                ...validCompanyInput,
                email: "segundo@example.com",
            })

            await expect(
                serviceWithEmailChange.updateUser(second.id, {
                    email: "joao@example.com",
                    currentPassword: validCompanyInput.password,
                }),
            ).rejects.toThrow(ConflictError)

            // A senha foi validada antes do conflito ser checado — se o
            // conflito fosse checado primeiro, essa chamada nunca aconteceria.
            expect(mockRequestEmailChange).not.toHaveBeenCalled()
        })

        it("sem requestEmailChange injetado (default), falha fechado em vez de aceitar silenciosamente", async () => {
            // userService (instanciado no beforeEach) usa o default —
            // nenhum teste precisa mockar env ou módulo pra provar isso.
            const created = await userService.createUser(validIndividualInput)

            await expect(
                userService.updateUser(created.id, {
                    email: "novo@example.com",
                    currentPassword: validIndividualInput.password,
                }),
            ).rejects.toThrow("requestEmailChange não foi configurado")
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
            await expect(userService.findById(created.id)).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar usuário inexistente", async () => {
            await expect(
                userService.deleteUser("00000000-0000-0000-0000-000000000000"),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar deletar uma conta de demonstração", async () => {
            const demo = await userService.createUser(validDemoInput)

            await expect(userService.deleteUser(demo.id)).rejects.toThrow(ForbiddenError)

            // A conta continua existindo — a exclusão não pode ter passado batido.
            await expect(userService.findById(demo.id)).resolves.toBeDefined()
        })
    })
})
