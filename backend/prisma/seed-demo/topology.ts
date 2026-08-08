import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { prisma } from "@/shared/database/prisma.js"

const distributorRepository = new DistributorRepository(prisma)
const propertyRepository = new PropertyRepository(prisma)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prisma)
const areaService = new AreaService(areaRepository, propertyRepository)
const deviceRepository = new DeviceRepository(prisma)
const deviceService = new DeviceService(deviceRepository, areaRepository, propertyRepository)

// MQTT porque é o único protocolo de fato integrado ponta a ponta no backend
// (ver .claude/docs/PLANO_SIMULADOR_IOT_E_SEED_DEMO.md) — host/port apontam pro
// broker embutido do iot-simulator, caso o usuário queira ligar um device
// virtual num desses medidores depois.
const DEMO_METER_HOST = "localhost"
const DEMO_METER_PORT = 1883

// Credenciais do broker MQTT do iot-simulator (issue #180 — o broker passou
// a exigir authenticate). Lidas do ambiente do processo de seed, com
// fallback para os mesmos valores de exemplo do .env.example do simulador —
// dado sintético de demonstração, não segredo de produção (mesmo espírito
// do resto deste seed). extra.password segue em texto claro por ora,
// tratado pela issue #182 (cifra de Meter.extra.password).
const DEMO_METER_CREDENTIALS = {
    username: process.env.SIMULATOR_BROKER_USERNAME ?? "sim-demo-user",
    password: process.env.SIMULATOR_BROKER_PASSWORD ?? "sim-demo-pass",
}

async function pickAnyDistributorId(): Promise<string> {
    const distributor = await prisma.energyDistributor.findFirst({ orderBy: { name: "asc" } })

    if (!distributor) {
        throw new Error(
            "Nenhuma distribuidora encontrada no catálogo. Rode `npm run db:seed` antes do seed de demonstração.",
        )
    }

    return distributor.id
}

export async function createResidentialTopology(userId: string) {
    const distributorId = await pickAnyDistributorId()

    const property = await propertyService.create(userId, {
        distributorId,
        name: "Casa Demo",
        address: "Rua das Acácias, 245",
        city: "Belo Horizonte",
        state: "MG",
        zipCode: "30130-010",
        electricalSystem: "BIPHASIC",
        billingClass: "B1",
    })

    const generalMeter = await prisma.meter.create({
        data: {
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: DEMO_METER_HOST,
            port: DEMO_METER_PORT,
            topic: "lumitrack/demo/residencial/geral",
            extra: DEMO_METER_CREDENTIALS,
        },
    })

    return { property, meters: { general: generalMeter } }
}

export async function createCommercialTopology(userId: string) {
    const distributorId = await pickAnyDistributorId()

    const property = await propertyService.create(userId, {
        distributorId,
        name: "Padaria Demo",
        address: "Av. Comercial, 900",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310-100",
        electricalSystem: "TRIPHASIC",
        billingClass: "B3",
        publicLightingFeeBrl: 42.5,
    })

    const generalMeter = await prisma.meter.create({
        data: {
            name: "Medidor Geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: DEMO_METER_HOST,
            port: DEMO_METER_PORT,
            topic: "lumitrack/demo/comercial/geral",
            extra: DEMO_METER_CREDENTIALS,
        },
    })

    const salesArea = await areaService.create(property.id, userId, { name: "Área de Vendas" })
    const kitchenArea = await areaService.create(property.id, userId, { name: "Produção/Cozinha" })

    const salesAreaMeter = await prisma.meter.create({
        data: {
            name: "Medidor Área de Vendas",
            targetType: "AREA",
            areaId: salesArea.id,
            protocol: "MQTT",
            host: DEMO_METER_HOST,
            port: DEMO_METER_PORT,
            topic: "lumitrack/demo/comercial/vendas",
            extra: DEMO_METER_CREDENTIALS,
        },
    })

    const oven = await deviceService.create(kitchenArea.id, property.id, userId, {
        name: "Forno Industrial",
        brand: "ProBake",
        model: "PB-3000",
        powerWatts: 5000,
    })
    const freezer = await deviceService.create(kitchenArea.id, property.id, userId, {
        name: "Câmara Fria",
        brand: "FrostTech",
        model: "FT-900",
        powerWatts: 1200,
    })
    const airConditioner = await deviceService.create(salesArea.id, property.id, userId, {
        name: "Ar-condicionado",
        brand: "ClimaMax",
        model: "CM-24",
        powerWatts: 2200,
    })

    const ovenMeter = await prisma.meter.create({
        data: {
            name: "Medidor Forno",
            targetType: "DEVICE",
            deviceId: oven.id,
            protocol: "MQTT",
            host: DEMO_METER_HOST,
            port: DEMO_METER_PORT,
            topic: "lumitrack/demo/comercial/forno",
            extra: DEMO_METER_CREDENTIALS,
        },
    })

    return {
        property,
        salesArea,
        kitchenArea,
        devices: { oven, freezer, airConditioner },
        meters: { general: generalMeter, salesArea: salesAreaMeter, oven: ovenMeter },
    }
}
