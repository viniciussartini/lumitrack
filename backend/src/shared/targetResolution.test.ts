import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prismaTest)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const repos = { propertyRepository, areaRepository, deviceRepository }

async function setupHierarchy() {
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
    })
    const distributor = await createTestDistributor(prismaTest)
    const property = await propertyService.create(user.id, {
        name: "Casa Principal",
        distributorId: distributor.id,
        electricalSystem: "TRIPHASIC",
    })
    const area = await areaService.create(property.id, user.id, { name: "Sala" })
    const device = await deviceService.create(area.id, property.id, user.id, {
        name: "Ar-condicionado",
    })
    return { user, property, area, device }
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: resolveRootProperty — primitiva central de autorização de posse
// (issue #281 — cobertura própria antes ausente; resolução agora em 1 query
// por ramo em vez de até 3 round trips sequenciais)
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveRootProperty", () => {
    it("resolve alvo PROPERTY (a própria propriedade)", async () => {
        const { property } = await setupHierarchy()

        const result = await resolveRootProperty("PROPERTY", property.id, repos)

        expect(result.id).toBe(property.id)
        expect(result.name).toBe("Casa Principal")
    })

    it("lança NotFoundError para PROPERTY inexistente", async () => {
        await expect(
            resolveRootProperty("PROPERTY", "00000000-0000-0000-0000-000000000000", repos),
        ).rejects.toThrow(NotFoundError)
    })

    it("resolve alvo AREA subindo até a propriedade dona", async () => {
        const { property, area } = await setupHierarchy()

        const result = await resolveRootProperty("AREA", area.id, repos)

        expect(result.id).toBe(property.id)
    })

    // Area.propertyId é FK obrigatória — não existe estado em que a área
    // exista mas a propriedade não. A única falha alcançável neste ramo é a
    // própria área não existir (ver comentário em targetResolution.ts).
    it("lança NotFoundError para AREA inexistente", async () => {
        await expect(
            resolveRootProperty("AREA", "00000000-0000-0000-0000-000000000000", repos),
        ).rejects.toThrow(NotFoundError)
    })

    it("resolve alvo DEVICE subindo até a propriedade dona", async () => {
        const { property, device } = await setupHierarchy()

        const result = await resolveRootProperty("DEVICE", device.id, repos)

        expect(result.id).toBe(property.id)
    })

    // Device.areaId e Area.propertyId são FKs obrigatórias — não existe
    // estado em que o device exista mas a área/propriedade não. A única
    // falha alcançável neste ramo é o próprio device não existir.
    it("lança NotFoundError para DEVICE inexistente", async () => {
        await expect(
            resolveRootProperty("DEVICE", "00000000-0000-0000-0000-000000000000", repos),
        ).rejects.toThrow(NotFoundError)
    })
})
