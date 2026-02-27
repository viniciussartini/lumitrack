import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserInput = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUserInput = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validDistributorInput = {
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.90,
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: DistributorService
// ─────────────────────────────────────────────────────────────────────────────

describe("DistributorService", () => {

    // ─── create ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("deve criar uma distribuidora com dados válidos e retornar campos numéricos", async () => {
            const user = await userService.createUser(validUserInput)

            const distributor = await distributorService.create(user.id, validDistributorInput)

            expect(distributor.id).toBeDefined()
            expect(distributor.userId).toBe(user.id)
            expect(distributor.name).toBe("CEMIG Distribuição S.A.")
            expect(distributor.cnpj).toBe("06.981.180/0001-16")
            expect(distributor.electricalSystem).toBe("TRIPHASIC")
            expect(distributor.workingVoltage).toBe(220)

            // Campos Decimal devem chegar como number, não como objeto Decimal.js.
            // Analogia: o repository é o câmbio — o service sempre recebe "reais",
            // não "cheques em moeda estrangeira".
            expect(typeof distributor.kwhPrice).toBe("number")
            expect(distributor.kwhPrice).toBe(0.75)
            expect(distributor.taxRate).toBe(0.12)
            expect(distributor.publicLightingFee).toBe(45.9)
        })

        it("deve criar uma distribuidora sem campos opcionais (taxRate e publicLightingFee)", async () => {
            const user = await userService.createUser(validUserInput)

            const { taxRate: _tr, publicLightingFee: _plf, ...inputWithoutOptionals } = validDistributorInput

            const distributor = await distributorService.create(user.id, inputWithoutOptionals)

            expect(distributor.taxRate).toBeNull()
            expect(distributor.publicLightingFee).toBeNull()
        })

        it("deve permitir que dois usuários diferentes cadastrem o mesmo CNPJ", async () => {
            // A constraint @@unique([userId, cnpj]) permite isso:
            // a CEMIG pode ter contrato com João E com Maria.
            const userA = await userService.createUser(validUserInput)
            const userB = await userService.createUser(anotherUserInput)

            const distA = await distributorService.create(userA.id, validDistributorInput)
            const distB = await distributorService.create(userB.id, validDistributorInput)

            expect(distA.id).not.toBe(distB.id)
            expect(distA.cnpj).toBe(distB.cnpj)
        })

        it("deve lançar ConflictError ao cadastrar o mesmo CNPJ duas vezes para o mesmo usuário", async () => {
            const user = await userService.createUser(validUserInput)
            await distributorService.create(user.id, validDistributorInput)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, name: "CEMIG Outro" }),
            ).rejects.toThrow(ConflictError)
        })

        it("deve lançar ValidationError para CNPJ com formato inválido", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, cnpj: "00.000.000/0000-00" }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para kwhPrice negativo ou zero", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, kwhPrice: 0 }),
            ).rejects.toThrow(ValidationError)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, kwhPrice: -1 }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para taxRate fora do intervalo [0, 1]", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, taxRate: 1.5 }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para tensão de trabalho inválida", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.create(user.id, { ...validDistributorInput, workingVoltage: 999 }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── findById ─────────────────────────────────────────────────────────────

    describe("findById", () => {
        it("deve retornar a distribuidora quando o usuário é o dono", async () => {
            const user = await userService.createUser(validUserInput)
            const created = await distributorService.create(user.id, validDistributorInput)

            const found = await distributorService.findById(created.id, user.id)

            expect(found.id).toBe(created.id)
            expect(found.name).toBe("CEMIG Distribuição S.A.")
        })

        it("deve lançar NotFoundError para ID inexistente", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.findById("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError quando a distribuidora pertence a outro usuário", async () => {
            // ForbiddenError (403) e não NotFoundError (404) porque o recurso
            // existe — apenas pertence a outro dono.
            // Analogia: você chega na portaria e o porteiro diz "esse apartamento existe,
            // mas você não tem autorização para entrar" — não "esse apartamento não existe".
            const userA = await userService.createUser(validUserInput)
            const userB = await userService.createUser(anotherUserInput)

            const dist = await distributorService.create(userA.id, validDistributorInput)

            await expect(
                distributorService.findById(dist.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── findAll ──────────────────────────────────────────────────────────────

    describe("findAll", () => {
        it("deve retornar lista vazia quando o usuário não tem distribuidoras", async () => {
            const user = await userService.createUser(validUserInput)

            const list = await distributorService.findAll(user.id)

            expect(list).toEqual([])
        })

        it("deve retornar apenas as distribuidoras do usuário autenticado", async () => {
            const userA = await userService.createUser(validUserInput)
            const userB = await userService.createUser(anotherUserInput)

            await distributorService.create(userA.id, validDistributorInput)
            await distributorService.create(userB.id, {
                ...validDistributorInput,
                name: "Distribuidora do usuário B",
                cnpj: "11.222.333/0001-81",
            })

            const listA = await distributorService.findAll(userA.id)

            expect(listA).toHaveLength(1)
            expect(listA[0]?.name).toBe("CEMIG Distribuição S.A.")
        })

        it("deve retornar distribuidoras ordenadas por nome", async () => {
            const user = await userService.createUser(validUserInput)

            await distributorService.create(user.id, { ...validDistributorInput, name: "CPFL Energia" })
            await distributorService.create(user.id, {
                ...validDistributorInput,
                name: "Enel São Paulo",
                cnpj: "11.222.333/0001-81",
            })
            await distributorService.create(user.id, {
                ...validDistributorInput,
                name: "CEMIG",
                cnpj: "61.695.227/0001-93",
            })

            const list = await distributorService.findAll(user.id)

            expect(list[0]?.name).toBe("CEMIG")
            expect(list[1]?.name).toBe("CPFL Energia")
            expect(list[2]?.name).toBe("Enel São Paulo")
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("deve atualizar campos permitidos", async () => {
            const user = await userService.createUser(validUserInput)
            const dist = await distributorService.create(user.id, validDistributorInput)

            const updated = await distributorService.update(dist.id, user.id, {
                name: "CEMIG Atualizada",
                kwhPrice: 0.85,
            })

            expect(updated.name).toBe("CEMIG Atualizada")
            expect(updated.kwhPrice).toBe(0.85)
            expect(updated.cnpj).toBe(dist.cnpj) // CNPJ não muda
        })

        it("deve lançar NotFoundError ao tentar atualizar distribuidora inexistente", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.update("00000000-0000-0000-0000-000000000000", user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar atualizar distribuidora de outro usuário", async () => {
            const userA = await userService.createUser(validUserInput)
            const userB = await userService.createUser(anotherUserInput)

            const dist = await distributorService.create(userA.id, validDistributorInput)

            await expect(
                distributorService.update(dist.id, userB.id, { name: "Tentativa" }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para kwhPrice inválido na atualização", async () => {
            const user = await userService.createUser(validUserInput)
            const dist = await distributorService.create(user.id, validDistributorInput)

            await expect(
                distributorService.update(dist.id, user.id, { kwhPrice: -5 }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── delete ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("deve deletar uma distribuidora existente do dono", async () => {
            const user = await userService.createUser(validUserInput)
            const dist = await distributorService.create(user.id, validDistributorInput)

            await distributorService.delete(dist.id, user.id)

            await expect(
                distributorService.findById(dist.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar distribuidora inexistente", async () => {
            const user = await userService.createUser(validUserInput)

            await expect(
                distributorService.delete("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar deletar distribuidora de outro usuário", async () => {
            const userA = await userService.createUser(validUserInput)
            const userB = await userService.createUser(anotherUserInput)

            const dist = await distributorService.create(userA.id, validDistributorInput)

            await expect(
                distributorService.delete(dist.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })
})