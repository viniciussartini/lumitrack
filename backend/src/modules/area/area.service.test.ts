import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AreaService } from "@/modules/area/area.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

const propertyRepository = new PropertyRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)

const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)

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

const validAreaInput = {
    name: "Sala de Estar",
    description: "Área principal de convivência",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cria usuário + distribuidora + propriedade — a cadeia completa necessária
// para qualquer teste de área. Analogia: antes de cadastrar um cômodo,
// você precisa ter uma casa, e antes da casa, um contrato de energia.
async function setupUserAndProperty(userInput = validUserA) {
    const user = await userService.createUser(userInput)
    const distributor = await distributorService.create(user.id, validDistributorInput)
    const property = await propertyService.create(user.id, {
        name: "Casa Principal",
        distributorId: distributor.id,
    })
    return { user, distributor, property }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AreaService
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaService", () => {

    // ─── create ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("deve criar uma área com todos os campos", async () => {
            const { user, property } = await setupUserAndProperty()

            const area = await areaService.create(property.id, user.id, validAreaInput)

            expect(area.id).toBeDefined()
            expect(area.propertyId).toBe(property.id)
            expect(area.name).toBe("Sala de Estar")
            expect(area.description).toBe("Área principal de convivência")
        })

        it("deve criar uma área sem description (campo opcional)", async () => {
            const { user, property } = await setupUserAndProperty()

            const area = await areaService.create(property.id, user.id, { name: "Garagem" })

            expect(area.name).toBe("Garagem")
            expect(area.description).toBeNull()
        })

        it("deve lançar NotFoundError ao criar área em propriedade inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                areaService.create("00000000-0000-0000-0000-000000000000", user.id, validAreaInput),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao criar área em propriedade de outro usuário", async () => {
            // A cadeia de posse: usuário → propriedade → área.
            // Mesmo que o usuário B conheça o propertyId de A, não pode criar áreas nela.
            const { property } = await setupUserAndProperty(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                areaService.create(property.id, userB.id, validAreaInput),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para nome vazio", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                areaService.create(property.id, user.id, { name: "" }),
            ).rejects.toThrow(ValidationError)
        })

        it("deve lançar ValidationError para description acima do limite de 1000 caracteres", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                areaService.create(property.id, user.id, {
                    name: "Área",
                    description: "x".repeat(1001),
                }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── findById ─────────────────────────────────────────────────────────────

    describe("findById", () => {
        it("deve retornar a área quando usuário é dono da propriedade", async () => {
            const { user, property } = await setupUserAndProperty()
            const created = await areaService.create(property.id, user.id, validAreaInput)

            const found = await areaService.findById(created.id, property.id, user.id)

            expect(found.id).toBe(created.id)
            expect(found.name).toBe("Sala de Estar")
        })

        it("deve lançar NotFoundError para ID de área inexistente", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                areaService.findById("00000000-0000-0000-0000-000000000000", property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError quando a propriedade pertence a outro usuário", async () => {
            const { property } = await setupUserAndProperty(validUserA)
            const userB = await userService.createUser(validUserB)

            // userB tenta acessar uma área passando o propertyId de A
            await expect(
                areaService.findById("00000000-0000-0000-0000-000000000000", property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar NotFoundError quando a área não pertence à propriedade informada", async () => {
            // Usuário tenta acessar uma área de outra propriedade sua.
            // Analogia: você tem dois apartamentos — não faz sentido buscar
            // o quarto do apt 101 usando o ID do apt 202.
            const { user, property: propertyA } = await setupUserAndProperty(validUserA)
            const distributorA = await distributorService.findAll(user.id)
            const propertyB = await propertyService.create(user.id, {
                name: "Escritório",
                distributorId: distributorA[0]!.id,
            })
            const area = await areaService.create(propertyA.id, user.id, validAreaInput)

            await expect(
                areaService.findById(area.id, propertyB.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })
    })

    // ─── findAll ──────────────────────────────────────────────────────────────

    describe("findAll", () => {
        it("deve retornar lista vazia quando a propriedade não tem áreas", async () => {
            const { user, property } = await setupUserAndProperty()

            const list = await areaService.findAll(property.id, user.id)

            expect(list).toEqual([])
        })

        it("deve retornar apenas as áreas da propriedade solicitada", async () => {
            const { user, property: propertyA } = await setupUserAndProperty(validUserA)
            const distributorA = await distributorService.findAll(user.id)
            const propertyB = await propertyService.create(user.id, {
                name: "Escritório",
                distributorId: distributorA[0]!.id,
            })

            await areaService.create(propertyA.id, user.id, { name: "Sala" })
            await areaService.create(propertyB.id, user.id, { name: "Recepção" })

            const listA = await areaService.findAll(propertyA.id, user.id)

            expect(listA).toHaveLength(1)
            expect(listA[0]?.name).toBe("Sala")
        })

        it("deve retornar áreas ordenadas por nome", async () => {
            const { user, property } = await setupUserAndProperty()

            await areaService.create(property.id, user.id, { name: "Quarto" })
            await areaService.create(property.id, user.id, { name: "Cozinha" })
            await areaService.create(property.id, user.id, { name: "Banheiro" })

            const list = await areaService.findAll(property.id, user.id)

            expect(list[0]?.name).toBe("Banheiro")
            expect(list[1]?.name).toBe("Cozinha")
            expect(list[2]?.name).toBe("Quarto")
        })

        it("deve lançar ForbiddenError ao listar áreas de propriedade de outro usuário", async () => {
            const { property } = await setupUserAndProperty(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                areaService.findAll(property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar NotFoundError ao listar áreas de propriedade inexistente", async () => {
            const user = await userService.createUser(validUserA)

            await expect(
                areaService.findAll("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("deve atualizar nome e description da área", async () => {
            const { user, property } = await setupUserAndProperty()
            const area = await areaService.create(property.id, user.id, validAreaInput)

            const updated = await areaService.update(area.id, property.id, user.id, {
                name: "Sala de Jantar",
                description: "Área reformada",
            })

            expect(updated.name).toBe("Sala de Jantar")
            expect(updated.description).toBe("Área reformada")
        })

        it("deve lançar NotFoundError ao tentar atualizar área inexistente", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                areaService.update("00000000-0000-0000-0000-000000000000", property.id, user.id, { name: "X" }),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar atualizar área de propriedade de outro usuário", async () => {
            const { property } = await setupUserAndProperty(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                areaService.update("00000000-0000-0000-0000-000000000000", property.id, userB.id, { name: "X" }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve lançar ValidationError para nome vazio na atualização", async () => {
            const { user, property } = await setupUserAndProperty()
            const area = await areaService.create(property.id, user.id, validAreaInput)

            await expect(
                areaService.update(area.id, property.id, user.id, { name: "" }),
            ).rejects.toThrow(ValidationError)
        })
    })

    // ─── delete ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("deve deletar uma área existente", async () => {
            const { user, property } = await setupUserAndProperty()
            const area = await areaService.create(property.id, user.id, validAreaInput)

            await areaService.delete(area.id, property.id, user.id)

            await expect(
                areaService.findById(area.id, property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar NotFoundError ao tentar deletar área inexistente", async () => {
            const { user, property } = await setupUserAndProperty()

            await expect(
                areaService.delete("00000000-0000-0000-0000-000000000000", property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("deve lançar ForbiddenError ao tentar deletar área de propriedade de outro usuário", async () => {
            const { property } = await setupUserAndProperty(validUserA)
            const userB = await userService.createUser(validUserB)

            await expect(
                areaService.delete("00000000-0000-0000-0000-000000000000", property.id, userB.id),
            ).rejects.toThrow(ForbiddenError)
        })

        it("deve cascatear e deletar a propriedade junto com suas áreas", async () => {
            // Confirma que onDelete: Cascade funciona na prática:
            // deletar a propriedade remove automaticamente as áreas vinculadas.
            const { user, property } = await setupUserAndProperty()
            await areaService.create(property.id, user.id, { name: "Sala" })
            await areaService.create(property.id, user.id, { name: "Quarto" })

            await propertyService.delete(property.id, user.id)

            // A propriedade sumiu — áreas não existem mais
            await expect(
                propertyService.findById(property.id, user.id),
            ).rejects.toThrow(NotFoundError)

            // Tentar listar as áreas da propriedade deletada retorna NotFoundError
            await expect(
                areaService.findAll(property.id, user.id),
            ).rejects.toThrow(NotFoundError)
        })
    })
})