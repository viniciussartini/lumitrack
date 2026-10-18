import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { AclContractService } from "@/modules/acl-contract/acl-contract.service.js"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const aclContractRepository = new AclContractRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

async function setupUserAndAclProperty(
    email = "joao@example.com",
    propertyOverrides: Partial<Parameters<typeof propertyService.create>[1]> = {},
) {
    const user = await userService.createUser({
        email,
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: email === "joao@example.com" ? "529.982.247-25" : "310.037.856-38",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Frigorífico",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
        tariffGroup: "GROUP_A",
        tariffSubgroup: "A4",
        tariffModality: "GREEN",
        contractedDemandKw: 200,
        contractingEnvironment: "ACL",
        ...propertyOverrides,
    })
    return { user, property }
}

const validInput = {
    retailerName: "Comerc Energia",
    submarket: "SOUTHEAST_CENTER_WEST" as const,
    energySource: "CONVENTIONAL" as const,
    energyPricePerMwh: 280,
    contractedVolumeMwh: 120,
    validFrom: "2026-01-01",
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("AclContractService", () => {
    describe("create", () => {
        it("cria um contrato vinculado a uma propriedade Grupo A no ambiente ACL", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            const contract = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
            })

            expect(contract.id).toBeDefined()
            expect(contract.userId).toBe(user.id)
            expect(contract.propertyId).toBe(property.id)
            expect(contract.retailerName).toBe("Comerc Energia")
            expect(contract.submarket).toBe("SOUTHEAST_CENTER_WEST")
            expect(contract.energySource).toBe("CONVENTIONAL")
            expect(contract.energyPricePerMwh).toBe(280)
            expect(contract.contractedVolumeMwh).toBe(120)
            expect(contract.validTo).toBeNull()
        })

        it("lança NotFoundError para propertyId inexistente", async () => {
            const { user } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    propertyId: "00000000-0000-0000-0000-000000000000",
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao vincular propriedade de outro usuário", async () => {
            const { property } = await setupUserAndAclProperty("joao@example.com")
            const { user: userB } = await setupUserAndAclProperty("maria@example.com")
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(userB.id, { ...validInput, propertyId: property.id }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("lança ValidationError para propriedade ainda no ambiente cativo (ACR)", async () => {
            const { user, property } = await setupUserAndAclProperty("joao@example.com", {
                contractingEnvironment: "ACR",
            })
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(user.id, { ...validInput, propertyId: property.id }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para preço de energia zero ou negativo", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    propertyId: property.id,
                    energyPricePerMwh: 0,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para volume contratado zero ou negativo", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    propertyId: property.id,
                    contractedVolumeMwh: -10,
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError quando validTo é anterior a validFrom", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.create(user.id, {
                    ...validInput,
                    propertyId: property.id,
                    validFrom: "2026-06-01",
                    validTo: "2026-01-01",
                }),
            ).rejects.toThrow(ValidationError)
        })

        it("aceita validTo posterior a validFrom", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            const contract = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
                validTo: "2026-12-31",
            })

            expect(contract.validTo).toEqual(new Date("2026-12-31"))
        })
    })

    describe("findAll", () => {
        it("retorna apenas os contratos do usuário autenticado, paginados", async () => {
            const { user: userA, property: propertyA } =
                await setupUserAndAclProperty("joao@example.com")
            const { user: userB, property: propertyB } =
                await setupUserAndAclProperty("maria@example.com")
            const service = new AclContractService(aclContractRepository, propertyRepository)
            await service.create(userA.id, { ...validInput, propertyId: propertyA.id })
            await service.create(userB.id, { ...validInput, propertyId: propertyB.id })

            const result = await service.findAll(userA.id, {})

            expect(result.total).toBe(1)
            expect(result.items[0]!.propertyId).toBe(propertyA.id)
        })

        it("filtra por propertyId quando informado", async () => {
            const { user, property: propertyA } = await setupUserAndAclProperty()
            const distributorB = await createTestDistributor(prismaTest)
            const propertyB = await propertyService.create(user.id, {
                name: "Galpão",
                distributorId: distributorB.id,
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                contractedDemandKw: 300,
                contractingEnvironment: "ACL",
            })
            const service = new AclContractService(aclContractRepository, propertyRepository)
            await service.create(user.id, { ...validInput, propertyId: propertyA.id })
            await service.create(user.id, { ...validInput, propertyId: propertyB.id })

            const result = await service.findAll(user.id, { propertyId: propertyA.id })

            expect(result.total).toBe(1)
            expect(result.items[0]!.propertyId).toBe(propertyA.id)
        })
    })

    describe("findById", () => {
        it("retorna o contrato quando o usuário é dono", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const created = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
            })

            const found = await service.findById(created.id, user.id)
            expect(found.id).toBe(created.id)
        })

        it("lança NotFoundError para ID inexistente", async () => {
            const { user } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.findById("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError quando o contrato pertence a outro usuário", async () => {
            const { user: userA, property: propertyA } =
                await setupUserAndAclProperty("joao@example.com")
            const { user: userB } = await setupUserAndAclProperty("maria@example.com")
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(userA.id, {
                ...validInput,
                propertyId: propertyA.id,
            })

            await expect(service.findById(contract.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })

    describe("update", () => {
        it("atualiza os campos permitidos", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
            })

            const updated = await service.update(contract.id, user.id, {
                energyPricePerMwh: 295,
            })

            expect(updated.energyPricePerMwh).toBe(295)
        })

        it("lança NotFoundError ao atualizar contrato inexistente", async () => {
            const { user } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.update("00000000-0000-0000-0000-000000000000", user.id, {
                    energyPricePerMwh: 300,
                }),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao atualizar contrato de outro usuário", async () => {
            const { user: userA, property: propertyA } =
                await setupUserAndAclProperty("joao@example.com")
            const { user: userB } = await setupUserAndAclProperty("maria@example.com")
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(userA.id, {
                ...validInput,
                propertyId: propertyA.id,
            })

            await expect(
                service.update(contract.id, userB.id, { energyPricePerMwh: 300 }),
            ).rejects.toThrow(ForbiddenError)
        })

        it("lança ValidationError para corpo vazio — PUT sem nenhum campo não é um no-op silencioso", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
            })

            await expect(service.update(contract.id, user.id, {})).rejects.toThrow(ValidationError)
        })
    })

    describe("delete", () => {
        it("deleta um contrato existente", async () => {
            const { user, property } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(user.id, {
                ...validInput,
                propertyId: property.id,
            })

            await service.delete(contract.id, user.id)

            await expect(service.findById(contract.id, user.id)).rejects.toThrow(NotFoundError)
        })

        it("lança NotFoundError ao deletar contrato inexistente", async () => {
            const { user } = await setupUserAndAclProperty()
            const service = new AclContractService(aclContractRepository, propertyRepository)

            await expect(
                service.delete("00000000-0000-0000-0000-000000000000", user.id),
            ).rejects.toThrow(NotFoundError)
        })

        it("lança ForbiddenError ao deletar contrato de outro usuário", async () => {
            const { user: userA, property: propertyA } =
                await setupUserAndAclProperty("joao@example.com")
            const { user: userB } = await setupUserAndAclProperty("maria@example.com")
            const service = new AclContractService(aclContractRepository, propertyRepository)
            const contract = await service.create(userA.id, {
                ...validInput,
                propertyId: propertyA.id,
            })

            await expect(service.delete(contract.id, userB.id)).rejects.toThrow(ForbiddenError)
        })
    })
})
