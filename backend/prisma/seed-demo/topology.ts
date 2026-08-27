import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DeviceService } from "@/modules/device/device.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { prisma } from "@/shared/database/prisma.js"
import { encryptMeterCredential } from "@/shared/crypto/meterCredentialEncryption.js"

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

// Credenciais do broker MQTT do iot-simulator (o broker exige authenticate).
// Lidas do ambiente do processo de seed, com fallback para os mesmos
// valores de exemplo do .env.example do simulador — dado sintético de
// demonstração, não segredo de produção (mesmo espírito do resto deste
// seed). `prisma.meter.create` é chamado direto (não via MeterRepository)
// neste script, então a senha precisa ser cifrada aqui mesmo, à mão — sem
// isso, ficaria em texto claro no banco (MeterRepository cifra
// automaticamente para todo o resto da aplicação, mas esse caminho de
// escrita raw do seed passa batido por ele).
const DEMO_METER_CREDENTIALS = {
    username: process.env.SIMULATOR_BROKER_USERNAME ?? "sim-demo-user",
    password: encryptMeterCredential(process.env.SIMULATOR_BROKER_PASSWORD ?? "sim-demo-pass"),
}

type MeterTarget =
    | { targetType: "PROPERTY"; propertyId: string }
    | { targetType: "AREA"; areaId: string }
    | { targetType: "DEVICE"; deviceId: string }

async function createDemoMeter(name: string, topic: string, target: MeterTarget) {
    return prisma.meter.create({
        data: {
            name,
            protocol: "MQTT",
            host: DEMO_METER_HOST,
            port: DEMO_METER_PORT,
            topic,
            extra: DEMO_METER_CREDENTIALS,
            ...target,
        },
    })
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

// Config de alerta (referencePowerKw/tolerancePercent) fica junto da
// definição do medidor de propósito — createDemoAlerts (alerts.ts) só
// itera a lista, sem precisar conhecer a topologia de novo.
export interface MeteredPoint {
    meterId: string
    meterName: string
    referencePowerKw: number
    tolerancePercent: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Residencial — "Casa Demo": submedição por cômodo (1 medidor por disjuntor),
// além do medidor geral (relógio de entrada da concessionária) que mantém o
// Painel funcional — RealtimeSection.tsx só mostra KPIs/potência ao vivo
// quando a PROPRIEDADE tem medidor vinculado diretamente a ela.
// ─────────────────────────────────────────────────────────────────────────────

interface RoomSpec {
    name: string
    topicSuffix: string
    referencePowerKw: number
    tolerancePercent: number
}

// Referências calibradas pelo padrão de carga típico de cada cômodo — o
// chuveiro elétrico é o pico mais previsível de uma casa brasileira
// (potência nominal quase constante), por isso tolerância menor; cômodos com
// carga mais variável (cozinha, área de serviço) ganham tolerância maior.
const ROOM_SPECS: readonly RoomSpec[] = [
    { name: "Sala de Estar", topicSuffix: "sala", referencePowerKw: 1.2, tolerancePercent: 30 },
    { name: "Cozinha", topicSuffix: "cozinha", referencePowerKw: 2.5, tolerancePercent: 25 },
    {
        name: "Quarto Casal",
        topicSuffix: "quarto-casal",
        referencePowerKw: 1.0,
        tolerancePercent: 30,
    },
    {
        name: "Banheiro — Chuveiro Elétrico",
        topicSuffix: "banheiro",
        referencePowerKw: 5.5,
        tolerancePercent: 15,
    },
    {
        name: "Área de Serviço",
        topicSuffix: "area-servico",
        referencePowerKw: 1.5,
        tolerancePercent: 25,
    },
]

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

    const generalMeter = await createDemoMeter(
        "Medidor Geral",
        "lumitrack/demo/residencial/geral",
        { targetType: "PROPERTY", propertyId: property.id },
    )

    const rooms: MeteredPoint[] = []

    for (const spec of ROOM_SPECS) {
        const area = await areaService.create(property.id, userId, { name: spec.name })
        const meter = await createDemoMeter(
            spec.name,
            `lumitrack/demo/residencial/${spec.topicSuffix}`,
            { targetType: "AREA", areaId: area.id },
        )

        rooms.push({
            meterId: meter.id,
            meterName: spec.name,
            referencePowerKw: spec.referencePowerKw,
            tolerancePercent: spec.tolerancePercent,
        })
    }

    return { property, meters: { general: generalMeter, rooms } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Comercial — "Metalúrgica Demo": pequena indústria de pequeno porte, não
// mais padaria. 4 áreas: Administrativo (medidor de área) + 3 áreas de
// processo produtivo, cada uma com medidor no equipamento específico —
// mesma lógica de submedição do residencial, adaptada a chão de fábrica.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductionAreaSpec {
    areaName: string
    deviceName: string
    brand: string
    model: string
    powerWatts: number
    topicSuffix: string
    referencePowerKw: number
    tolerancePercent: number
}

const PRODUCTION_AREA_SPECS: readonly ProductionAreaSpec[] = [
    {
        areaName: "Corte e Usinagem",
        deviceName: "Torno CNC",
        brand: "Romi",
        model: "GL 240",
        powerWatts: 7500,
        topicSuffix: "torno-cnc",
        referencePowerKw: 6,
        tolerancePercent: 20,
    },
    {
        areaName: "Solda",
        deviceName: "Máquina de Solda MIG/MAG",
        brand: "ESAB",
        model: "Powertec 305S",
        powerWatts: 5000,
        topicSuffix: "solda",
        referencePowerKw: 4.5,
        tolerancePercent: 20,
    },
    {
        areaName: "Compressão e Acabamento",
        deviceName: "Compressor de Ar Industrial",
        brand: "Schulz",
        model: "MSV 20 Max",
        powerWatts: 11000,
        topicSuffix: "compressor",
        referencePowerKw: 9,
        tolerancePercent: 15,
    },
]

const ADMIN_SPEC = { referencePowerKw: 3, tolerancePercent: 25 } as const
const GENERAL_SPEC = { referencePowerKw: 25, tolerancePercent: 20 } as const

export async function createCommercialTopology(userId: string) {
    const distributorId = await pickAnyDistributorId()

    const property = await propertyService.create(userId, {
        distributorId,
        name: "Metalúrgica Demo",
        address: "Rua dos Metalúrgicos, 1200",
        city: "São Bernardo do Campo",
        state: "SP",
        zipCode: "09710-000",
        electricalSystem: "TRIPHASIC",
        billingClass: "B3",
        publicLightingFeeBrl: 42.5,
    })

    const generalMeter = await createDemoMeter("Medidor Geral", "lumitrack/demo/comercial/geral", {
        targetType: "PROPERTY",
        propertyId: property.id,
    })

    const adminArea = await areaService.create(property.id, userId, { name: "Administrativo" })
    const adminMeter = await createDemoMeter(
        "Medidor Administrativo",
        "lumitrack/demo/comercial/administrativo",
        { targetType: "AREA", areaId: adminArea.id },
    )

    const production: MeteredPoint[] = []

    for (const spec of PRODUCTION_AREA_SPECS) {
        const area = await areaService.create(property.id, userId, { name: spec.areaName })
        const device = await deviceService.create(area.id, property.id, userId, {
            name: spec.deviceName,
            brand: spec.brand,
            model: spec.model,
            powerWatts: spec.powerWatts,
        })
        const meter = await createDemoMeter(
            spec.deviceName,
            `lumitrack/demo/comercial/${spec.topicSuffix}`,
            { targetType: "DEVICE", deviceId: device.id },
        )

        production.push({
            meterId: meter.id,
            meterName: spec.deviceName,
            referencePowerKw: spec.referencePowerKw,
            tolerancePercent: spec.tolerancePercent,
        })
    }

    const meters: MeteredPoint[] = [
        {
            meterId: generalMeter.id,
            meterName: "Medidor Geral",
            referencePowerKw: GENERAL_SPEC.referencePowerKw,
            tolerancePercent: GENERAL_SPEC.tolerancePercent,
        },
        {
            meterId: adminMeter.id,
            meterName: "Medidor Administrativo",
            referencePowerKw: ADMIN_SPEC.referencePowerKw,
            tolerancePercent: ADMIN_SPEC.tolerancePercent,
        },
        ...production,
    ]

    return { property, meters }
}
