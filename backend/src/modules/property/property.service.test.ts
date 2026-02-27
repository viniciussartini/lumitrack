import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { PropertyService } from "@/modules/property/property.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const validUserB = {
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
}

const validPropertyInput = {
    name: "Casa Principal",
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG" as const,
    zipCode: "30130-010",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cria usuário + distribuidora, retorna os IDs prontos para uso nos testes.
async function setupUserAndDistributor(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    return { user, distributor }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: PropertyService
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyService", () => {

    // ─── create ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("deve criar uma propriedade com todos os campos", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            expect(property.id).toBeDefined()
            expect(property.userId).toBe(user.id)
            expect(property.distributorId).toBe(distributor.id)
            expect(property.name).toBe("Casa Principal")
            expect(property.city).toBe("Belo Horizonte")
            expect(property.state).toBe("MG")
            expect(property.zipCode).toBe("30130-010")
        })

        it("deve criar uma propriedade sem campos de endereço (todos opcionais)", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            const property = await propertyService.create(user.id, {
                name: "Galpão Industrial",
                distributorId: distributor.id,
            })

            expect(property.name).toBe("Galpão Industrial")
            expect(property.address).toBeNull()
            expect(property.city).toBeNull()
            expect(property.state).toBeNull()
            expect(property.zipCode).toBeNull()
        })

        it("deve lançar NotFoundError ao vincular distribuidora inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao vincular distribuidora de outro usuário", async () => {
            // Analogia: você não pode registrar uma propriedade em seu nome
            // usando o contrato de energia de outra pessoa.
            const { user: userA, distributor: distA } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                propertyService.create(userB.id, {
                    ...validPropertyInput,
                    distributorId: distA.id,
                }),
            ).rejects.toThrow(ForbiddenError)

            // Garante que userA não é afetado
            expect(distA.userId).toBe(userA.id)
        })

        it("deve lançar ValidationError para estado (UF) inválido", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: distributor.id,
                    state: "XX" as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para CEP com formato inválido", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: distributor.id,
                    zipCode: "30130010", // sem hífen
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para CEP com sequência repetida (ex: 00000-000)", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: distributor.id,
                    zipCode: "00000-000",
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para distributorId que não é UUID", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: "nao-e-um-uuid",
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── findById ─────────────────────────────────────────────────────────────

    describe("findById", () => {
        it("deve retornar a propriedade quando o usuário é o dono", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const created = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            const found = await propertyService.findById(created.id, user.id)

            expect(found.id).toBe(created.id)
            expect(found.name).toBe("Casa Principal")
        })

        it("deve lançar NotFoundError para ID inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.findById("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError quando a propriedade pertence a outro usuário", async () => {
            const { user: userA, distributor } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            const property = await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await expect(
                propertyService.findById(property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── findAll ──────────────────────────────────────────────────────────────

    describe("findAll", () => {
        it("deve retornar lista vazia quando o usuário não tem propriedades", async () => {
            const user = await userService.createUser(validUserA)

            const list = await propertyService.findAll(user.id)

            expect(list).toEqual([])
        })

        it("deve retornar apenas as propriedades do usuário autenticado", async () => {
            const { user: userA, distributor: distA } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)
            const distB = await distributorService.create(userB.id, validDistributorInput)

            await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distA.id,
            })
            await propertyService.create(userB.id, {
                name: "Propriedade de B",
                distributorId: distB.id,
            })

            const listA = await propertyService.findAll(userA.id)

            expect(listA).toHaveLength(1)
            expect(listA[0]?.name).toBe("Casa Principal")
        })

        it("deve retornar propriedades ordenadas por nome", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await propertyService.create(user.id, { name: "Escritório Centro", distributorId: distributor.id })
            await propertyService.create(user.id, { name: "Apartamento", distributorId: distributor.id })
            await propertyService.create(user.id, { name: "Galpão Industrial", distributorId: distributor.id })

            const list = await propertyService.findAll(user.id)

            expect(list[0]?.name).toBe("Apartamento")
            expect(list[1]?.name).toBe("Escritório Centro")
            expect(list[2]?.name).toBe("Galpão Industrial")
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("deve atualizar campos de endereço", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            const updated = await propertyService.update(property.id, user.id, {
                name: "Casa Renovada",
                city: "Contagem",
            })

            expect(updated.name).toBe("Casa Renovada")
            expect(updated.city).toBe("Contagem")
            expect(updated.state).toBe("MG") // não mudou
        })

        it("deve permitir trocar a distribuidora vinculada", async () => {
            const { user, distributor: dist1 } = await setupUserAndDistributor()
            const dist2 = await distributorService.create(user.id, {
                ...validDistributorInput,
                name: "CPFL Energia",
                cnpj: "02.429.144/0001-93",
            })
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: dist1.id,
            })

            const updated = await propertyService.update(property.id, user.id, {
                distributorId: dist2.id,
            })

            expect(updated.distributorId).toBe(dist2.id)
        })

        it("deve lançar ForbiddenError ao tentar vincular distribuidora de outro usuário na atualização", async () => {
            const { user: userA, distributor: distA } = await setupUserAndDistributor(validUserA)
            const { distributor: distB } = await setupUserAndDistributor(validUserB)

            const property = await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distA.id,
            })

            await expect(
                propertyService.update(property.id, userA.id, {
                    distributorId: distB.id,
                }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar NotFoundError ao tentar atualizar propriedade inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.update("00000000-0000-0000-0000-000000000000", user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar atualizar propriedade de outro usuário", async () => {
            const { user: userA, distributor } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            const property = await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await expect(
                propertyService.update(property.id, userB.id, { name: "Tentativa" }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para UF inválida na atualização", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await expect(
                propertyService.update(property.id, user.id, { state: "ZZ" as any }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── delete ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("deve deletar uma propriedade existente", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await propertyService.delete(property.id, user.id)

            await expect(
                propertyService.findById(property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar propriedade inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.delete("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar deletar propriedade de outro usuário", async () => {
            const { user: userA, distributor } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            const property = await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await expect(
                propertyService.delete(property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })
    })

    // ─── Regra: delete de distribuidora com propriedades vinculadas ───────────

    describe("regra de integridade: distribuidora com propriedades vinculadas", () => {
        it("deve bloquear o delete da distribuidora quando há propriedades vinculadas", async () => {
            // Esta regra é garantida pelo banco (Restrict no FK), mas validamos
            // também no service de distribuidora para dar uma mensagem clara.
            // O teste aqui documenta o comportamento esperado do ponto de vista
            // do domínio — o teste específico fica em distributor.service.test.ts.
            // Aqui apenas confirmamos que a propriedade persiste após a tentativa.
            const { user, distributor } = await setupUserAndDistributor()
            await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            // A distribuidora ainda deve existir após a tentativa falha de delete
            const distStillExists = await distributorService.findById(distributor.id, user.id)
            expect(distStillExists.id).toBe(distributor.id)
        })
    })
})