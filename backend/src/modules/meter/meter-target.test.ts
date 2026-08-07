import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { resolveMeterTarget } from "@/modules/meter/meter-target.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
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

const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prismaTest)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const repos = { meterRepository, propertyRepository, areaRepository, deviceRepository }

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

describe("resolveMeterTarget", () => {
    it("retorna null para meterId inexistente", async () => {
        expect(await resolveMeterTarget(repos, "00000000-0000-0000-0000-000000000000")).toBeNull()
    })

    it("resolve alvo PROPERTY", async () => {
        const { user, property } = await setupHierarchy()
        const meter = await prismaTest.meter.create({
            data: {
                name: "Medidor",
                targetType: "PROPERTY",
                propertyId: property.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "t",
            },
        })

        const result = await resolveMeterTarget(repos, meter.id)

        expect(result).toEqual({
            ownerId: user.id,
            targetType: "PROPERTY",
            targetName: "Casa Principal",
            targetPath: `/propriedades/${property.id}`,
        })
    })

    it("resolve alvo AREA", async () => {
        const { user, property, area } = await setupHierarchy()
        const meter = await prismaTest.meter.create({
            data: {
                name: "Medidor",
                targetType: "AREA",
                areaId: area.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "t",
            },
        })

        const result = await resolveMeterTarget(repos, meter.id)

        expect(result).toEqual({
            ownerId: user.id,
            targetType: "AREA",
            targetName: "Sala",
            targetPath: `/propriedades/${property.id}/areas/${area.id}`,
        })
    })

    it("resolve alvo DEVICE", async () => {
        const { user, property, area, device } = await setupHierarchy()
        const meter = await prismaTest.meter.create({
            data: {
                name: "Medidor",
                targetType: "DEVICE",
                deviceId: device.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "t",
            },
        })

        const result = await resolveMeterTarget(repos, meter.id)

        expect(result).toEqual({
            ownerId: user.id,
            targetType: "DEVICE",
            targetName: "Ar-condicionado",
            targetPath: `/propriedades/${property.id}/areas/${area.id}/devices/${device.id}`,
        })
    })
})
