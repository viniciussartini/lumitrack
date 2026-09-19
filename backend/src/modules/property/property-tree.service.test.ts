import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { PropertyTreeService } from "@/modules/property/property-tree.service.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const propertyRepository = new PropertyRepository(prismaTest)
const areaRepository = new AreaRepository(prismaTest)
const deviceRepository = new DeviceRepository(prismaTest)
const propertyService = new PropertyService(
    propertyRepository,
    new DistributorRepository(prismaTest),
)
const treeService = new PropertyTreeService(propertyRepository, areaRepository, deviceRepository)
const userService = new UserService(new UserRepository(prismaTest))

const userA = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const userB = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const propertyInput = {
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG" as const,
    zipCode: "30130-010",
    electricalSystem: "TRIPHASIC" as const,
}

async function createUserWithDistributor(input = userA) {
    const user = await userService.createUser(input)
    const distributor = await createTestDistributor(prismaTest)
    return { userId: user.id, distributorId: distributor.id }
}

async function createProperty(userId: string, distributorId: string, name: string) {
    return propertyService.create(userId, { ...propertyInput, name, distributorId })
}

async function createArea(propertyId: string, name: string) {
    return prismaTest.area.create({
        data: { propertyId, name, description: "descrição que não vai na árvore" },
    })
}

async function createDevice(areaId: string, name: string, powerWatts: number | null = null) {
    return prismaTest.device.create({
        data: { areaId, name, brand: "Marca", model: "Modelo", powerWatts },
    })
}

beforeEach(async () => {
    vi.restoreAllMocks()
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("PropertyTreeService.findTree", () => {
    it("devolve árvore vazia quando o usuário não tem propriedades", async () => {
        const { userId } = await createUserWithDistributor()

        const tree = await treeService.findTree(userId)

        expect(tree).toEqual({ items: [], total: 0 })
    })

    it("monta propriedades → áreas → dispositivos, cada nível ordenado por nome", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const loja = await createProperty(userId, distributorId, "Loja")
        const casa = await createProperty(userId, distributorId, "Casa")
        const quarto = await createArea(casa.id, "Quarto")
        const cozinha = await createArea(casa.id, "Cozinha")
        const geladeira = await createDevice(cozinha.id, "Geladeira", 150)
        const ventilador = await createDevice(cozinha.id, "Ventilador", null)
        await createArea(loja.id, "Balcão")

        const tree = await treeService.findTree(userId)

        expect(tree.total).toBe(2)
        expect(tree.items).toEqual([
            {
                id: casa.id,
                name: "Casa",
                areas: [
                    {
                        id: cozinha.id,
                        name: "Cozinha",
                        devices: [
                            { id: geladeira.id, name: "Geladeira", powerWatts: 150 },
                            { id: ventilador.id, name: "Ventilador", powerWatts: null },
                        ],
                    },
                    { id: quarto.id, name: "Quarto", devices: [] },
                ],
            },
            {
                id: loja.id,
                name: "Loja",
                areas: [expect.objectContaining({ name: "Balcão", devices: [] })],
            },
        ])
    })

    it("mantém propriedade sem áreas com a lista de áreas vazia", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const property = await createProperty(userId, distributorId, "Casa")

        const tree = await treeService.findTree(userId)

        expect(tree.items).toEqual([{ id: property.id, name: "Casa", areas: [] }])
    })

    it("não expõe endereço nem campos além de id, nome e potência", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const property = await createProperty(userId, distributorId, "Casa")
        const area = await createArea(property.id, "Sala")
        await createDevice(area.id, "TV", 100)

        const tree = await treeService.findTree(userId)
        const serialized = JSON.stringify(tree)

        expect(serialized).not.toContain("Rua das Flores")
        expect(serialized).not.toContain("Belo Horizonte")
        expect(serialized).not.toContain("descrição que não vai na árvore")
        expect(serialized).not.toContain("Marca")
        expect(Object.keys(tree.items[0]!).sort()).toEqual(["areas", "id", "name"])
        expect(Object.keys(tree.items[0]!.areas[0]!).sort()).toEqual(["devices", "id", "name"])
        expect(Object.keys(tree.items[0]!.areas[0]!.devices[0]!).sort()).toEqual([
            "id",
            "name",
            "powerWatts",
        ])
    })

    it("nunca inclui propriedades, áreas ou dispositivos de outro usuário", async () => {
        const a = await createUserWithDistributor(userA)
        const b = await userService.createUser(userB)
        const propA = await createProperty(a.userId, a.distributorId, "Casa de A")
        const propB = await createProperty(b.id, a.distributorId, "Casa de B")
        const areaB = await createArea(propB.id, "Sala de B")
        await createDevice(areaB.id, "TV de B", 90)
        await createArea(propA.id, "Sala de A")

        const treeA = await treeService.findTree(a.userId)
        const treeB = await treeService.findTree(b.id)

        expect(treeA.items.map((p) => p.name)).toEqual(["Casa de A"])
        expect(treeA.items[0]!.areas.map((ar) => ar.name)).toEqual(["Sala de A"])
        expect(JSON.stringify(treeA)).not.toContain("de B")
        expect(treeB.items.map((p) => p.name)).toEqual(["Casa de B"])
        expect(JSON.stringify(treeB)).not.toContain("de A")
    })

    it("respeita o teto de propriedades e informa o total real", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const limited = new PropertyTreeService(
            propertyRepository,
            areaRepository,
            deviceRepository,
            2,
        )
        for (const name of ["Casa C", "Casa A", "Casa B"]) {
            const property = await createProperty(userId, distributorId, name)
            await createArea(property.id, `Área de ${name}`)
        }

        const tree = await limited.findTree(userId)

        expect(tree.total).toBe(3)
        expect(tree.items.map((p) => p.name)).toEqual(["Casa A", "Casa B"])
        expect(JSON.stringify(tree)).not.toContain("Casa C")
    })

    it("lê áreas e dispositivos só das propriedades que entraram na árvore", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const limited = new PropertyTreeService(
            propertyRepository,
            areaRepository,
            deviceRepository,
            2,
        )
        for (const name of ["Casa C", "Casa A", "Casa B"]) {
            const property = await createProperty(userId, distributorId, name)
            const area = await createArea(property.id, `Área de ${name}`)
            await createDevice(area.id, `Aparelho de ${name}`)
        }
        const areaSpy = vi.spyOn(areaRepository, "findAllByUserInProperties")
        const deviceSpy = vi.spyOn(deviceRepository, "findAllByUserInProperties")

        const tree = await limited.findTree(userId)

        const keptIds = tree.items.map((property) => property.id)
        expect(keptIds).toHaveLength(2)
        expect(areaSpy).toHaveBeenCalledWith(userId, keptIds)
        expect(deviceSpy).toHaveBeenCalledWith(userId, keptIds)
        const areasRead = await areaSpy.mock.results[0]!.value
        const devicesRead = await deviceSpy.mock.results[0]!.value
        expect(areasRead.map((area: { name: string }) => area.name).sort()).toEqual([
            "Área de Casa A",
            "Área de Casa B",
        ])
        expect(devicesRead).toHaveLength(2)
    })

    it("não consulta áreas nem dispositivos quando o usuário não tem propriedades", async () => {
        const { userId } = await createUserWithDistributor()
        const areaSpy = vi.spyOn(areaRepository, "findAllByUserInProperties")
        const deviceSpy = vi.spyOn(deviceRepository, "findAllByUserInProperties")

        await treeService.findTree(userId)

        expect(areaSpy).not.toHaveBeenCalled()
        expect(deviceSpy).not.toHaveBeenCalled()
    })
})

describe("leitura de áreas e dispositivos por propriedades", () => {
    it("ignora ids de propriedades que pertencem a outro usuário", async () => {
        const a = await createUserWithDistributor(userA)
        const b = await userService.createUser(userB)
        const propB = await createProperty(b.id, a.distributorId, "Casa de B")
        const areaB = await createArea(propB.id, "Sala de B")
        await createDevice(areaB.id, "TV de B")

        const areas = await areaRepository.findAllByUserInProperties(a.userId, [propB.id])
        const devices = await deviceRepository.findAllByUserInProperties(a.userId, [propB.id])

        expect(areas).toEqual([])
        expect(devices).toEqual([])
    })

    it("devolve só as áreas e dispositivos das propriedades pedidas, por nome", async () => {
        const { userId, distributorId } = await createUserWithDistributor()
        const casa = await createProperty(userId, distributorId, "Casa")
        const loja = await createProperty(userId, distributorId, "Loja")
        const sala = await createArea(casa.id, "Sala")
        const copa = await createArea(casa.id, "Copa")
        const balcao = await createArea(loja.id, "Balcão")
        await createDevice(sala.id, "TV")
        await createDevice(balcao.id, "Caixa")

        const areas = await areaRepository.findAllByUserInProperties(userId, [casa.id])
        const devices = await deviceRepository.findAllByUserInProperties(userId, [casa.id])

        expect(areas.map((area) => area.id)).toEqual([copa.id, sala.id])
        expect(devices.map((device) => device.name)).toEqual(["TV"])
    })
})
