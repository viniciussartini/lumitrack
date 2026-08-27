import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { PropertyService } from "@/modules/property/property.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import type { CreatePropertyInput } from "@/modules/property/property.schema.js"
import { decryptAddress } from "@/shared/crypto/addressEncryption.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUserA = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const validUserB = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validPropertyInput = {
    name: "Casa Principal",
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG" as const,
    zipCode: "30130-010",
    electricalSystem: "TRIPHASIC" as const,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cria usuário + distribuidora (catálogo global — inserida direto no banco,
// não há mais POST /api/distributors), retorna os IDs prontos para uso.
async function setupUserAndDistributor(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await createTestDistributor(prismaTest)
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
            expect(property.electricalSystem).toBe("TRIPHASIC")
            expect(property.billingClass).toBe("B1") // default
            expect(property.publicLightingFeeBrl).toBeNull()
        })

        // O controle de cifra (A04/Art. 46) já existe em
        // property.repository.ts desde a introdução de addressEncryption.ts;
        // este teste lê a coluna direto e confirma que o valor em repouso
        // não é o texto claro (mesmo padrão já usado para o hash de senha
        // em user.service.test.ts).
        it("armazena address/city/state/zipCode cifrados em repouso, nunca em texto claro", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            const raw = await prismaTest.property.findUniqueOrThrow({ where: { id: property.id } })

            expect(raw.address).toBeDefined()
            expect(raw.address).not.toBe(validPropertyInput.address)
            expect(raw.city).not.toBe(validPropertyInput.city)
            expect(raw.state).not.toBe(validPropertyInput.state)
            expect(raw.zipCode).not.toBe(validPropertyInput.zipCode)

            // E decifram de volta para o valor original — confirma que não é
            // só lixo diferente, é um ciphertext válido do dado certo.
            expect(decryptAddress(raw.address!)).toBe(validPropertyInput.address)
            expect(decryptAddress(raw.city!)).toBe(validPropertyInput.city)
            expect(decryptAddress(raw.state!)).toBe(validPropertyInput.state)
            expect(decryptAddress(raw.zipCode!)).toBe(validPropertyInput.zipCode)
        })

        it("deve criar uma propriedade sem campos de endereço (todos opcionais)", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            const property = await propertyService.create(user.id, {
                name: "Galpão Industrial",
                distributorId: distributor.id,
                electricalSystem: "TRIPHASIC",
            })

            expect(property.name).toBe("Galpão Industrial")
            expect(property.address).toBeNull()
            expect(property.city).toBeNull()
            expect(property.state).toBeNull()
            expect(property.zipCode).toBeNull()
        })

        it("deve aceitar billingClass e publicLightingFeeBrl explícitos", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
                billingClass: "B3",
                publicLightingFeeBrl: 32.5,
            })

            expect(property.billingClass).toBe("B3")
            expect(property.publicLightingFeeBrl).toBe(32.5)
        })

        it("deve lançar ValidationError quando electricalSystem está ausente", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await expect(
                propertyService.create(user.id, {
                    name: "Casa",
                    distributorId: distributor.id,
                } as unknown),
            ).rejects.toThrow(ValidationError)
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

        it("deve permitir vincular a mesma distribuidora do catálogo para usuários diferentes", async () => {
            // Distribuidora agora é um catálogo global compartilhado — não há
            // mais noção de "distribuidora de outro usuário".
            const { distributor } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            const property = await propertyService.create(userB.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            expect(property.distributorId).toBe(distributor.id)
        })

        it("deve lançar ValidationError para estado (UF) inválido", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await expect(
                propertyService.create(user.id, {
                    ...validPropertyInput,
                    distributorId: distributor.id,
                    state: "XX" as unknown as CreatePropertyInput["state"],
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

            await expect(propertyService.findById(property.id, userB.id)).rejects.toThrow(
                ForbiddenError,
            )
        })
    })

    // ─── findAll ──────────────────────────────────────────────────────────────

    describe("findAll", () => {
        it("deve retornar lista vazia quando o usuário não tem propriedades", async () => {
            const user = await userService.createUser(validUserA)

            const result = await propertyService.findAll(user.id, {})

            expect(result.items).toEqual([])
            expect(result.total).toBe(0)
        })

        it("deve retornar apenas as propriedades do usuário autenticado", async () => {
            const { user: userA, distributor } = await setupUserAndDistributor(validUserA)
            const userB = await userService.createUser(validUserB)

            await propertyService.create(userA.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })
            await propertyService.create(userB.id, {
                name: "Propriedade de B",
                distributorId: distributor.id,
                electricalSystem: "TRIPHASIC",
            })

            const result = await propertyService.findAll(userA.id, {})

            expect(result.items).toHaveLength(1)
            expect(result.items[0]?.name).toBe("Casa Principal")
        })

        it("deve retornar propriedades ordenadas por nome", async () => {
            const { user, distributor } = await setupUserAndDistributor()

            await propertyService.create(user.id, {
                name: "Escritório Centro",
                distributorId: distributor.id,
                electricalSystem: "TRIPHASIC",
            })
            await propertyService.create(user.id, {
                name: "Apartamento",
                distributorId: distributor.id,
                electricalSystem: "MONOPHASIC",
            })
            await propertyService.create(user.id, {
                name: "Galpão Industrial",
                distributorId: distributor.id,
                electricalSystem: "TRIPHASIC",
            })

            const result = await propertyService.findAll(user.id, {})

            expect(result.items[0]?.name).toBe("Apartamento")
            expect(result.items[1]?.name).toBe("Escritório Centro")
            expect(result.items[2]?.name).toBe("Galpão Industrial")
        })

        it("deve paginar respeitando page e pageSize", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            for (let i = 0; i < 3; i++) {
                await propertyService.create(user.id, {
                    name: `Prop ${i}`,
                    distributorId: distributor.id,
                    electricalSystem: "TRIPHASIC",
                })
            }

            const result = await propertyService.findAll(user.id, { page: 1, pageSize: 2 })

            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(3)
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

        it("deve atualizar billingClass e publicLightingFeeBrl", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            const updated = await propertyService.update(property.id, user.id, {
                billingClass: "B2",
                publicLightingFeeBrl: 18.4,
            })

            expect(updated.billingClass).toBe("B2")
            expect(updated.publicLightingFeeBrl).toBe(18.4)
        })

        it("deve permitir trocar a distribuidora vinculada", async () => {
            const { user, distributor: dist1 } = await setupUserAndDistributor()
            const dist2 = await createTestDistributor(prismaTest, { name: "CPFL Energia" })
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: dist1.id,
            })

            const updated = await propertyService.update(property.id, user.id, {
                distributorId: dist2.id,
            })

            expect(updated.distributorId).toBe(dist2.id)
        })

        it("deve lançar NotFoundError ao trocar para distribuidora inexistente", async () => {
            const { user, distributor } = await setupUserAndDistributor()
            const property = await propertyService.create(user.id, {
                ...validPropertyInput,
                distributorId: distributor.id,
            })

            await expect(
                propertyService.update(property.id, user.id, {
                    distributorId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar atualizar propriedade inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                propertyService.update("00000000-0000-0000-0000-000000000000", user.id, {
                    name: "X",
                }),
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
                propertyService.update(property.id, user.id, {
                    state: "ZZ" as unknown as CreatePropertyInput["state"],
                }),
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

            await expect(propertyService.findById(property.id, user.id)).rejects.toThrow(
                NotFoundError,
            )
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

            await expect(propertyService.delete(property.id, userB.id)).rejects.toThrow(
                ForbiddenError,
            )
        })
    })
})
