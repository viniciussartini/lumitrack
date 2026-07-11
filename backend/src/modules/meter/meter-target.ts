import type { TargetType } from "@/generated/prisma/client.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"

export type MeterTargetRepos = {
    meterRepository: MeterRepository
    propertyRepository: PropertyRepository
    areaRepository: AreaRepository
    deviceRepository: DeviceRepository
}

export type MeterTargetInfo = {
    ownerId: string
    targetType: TargetType
    targetName: string
    targetPath: string
}

// Resolve o alvo (propriedade/área/dispositivo) de um medidor: o dono (para
// checagem de posse e roteamento de eventos SSE por userId), o nome (exibição
// em listas de alerta) e o path da página de detalhes no frontend — usado
// pela notificação para navegar direto ao alvo que disparou o alerta.
// Retorna null se o medidor não existe ou seu alvo já foi removido.
export async function resolveMeterTarget(
    repos: MeterTargetRepos,
    meterId: string,
): Promise<MeterTargetInfo | null> {
    const meter = await repos.meterRepository.findById(meterId)
    if (!meter) return null

    if (meter.targetType === "PROPERTY") {
        const property = await repos.propertyRepository.findById(meter.propertyId!)
        if (!property) return null
        return {
            ownerId: property.userId,
            targetType: "PROPERTY",
            targetName: property.name,
            targetPath: `/propriedades/${property.id}`,
        }
    }

    if (meter.targetType === "AREA") {
        const area = await repos.areaRepository.findById(meter.areaId!)
        if (!area) return null
        const property = await repos.propertyRepository.findById(area.propertyId)
        if (!property) return null
        return {
            ownerId: property.userId,
            targetType: "AREA",
            targetName: area.name,
            targetPath: `/propriedades/${property.id}/areas/${area.id}`,
        }
    }

    // DEVICE
    const device = await repos.deviceRepository.findById(meter.deviceId!)
    if (!device) return null
    const area = await repos.areaRepository.findById(device.areaId)
    if (!area) return null
    const property = await repos.propertyRepository.findById(area.propertyId)
    if (!property) return null
    return {
        ownerId: property.userId,
        targetType: "DEVICE",
        targetName: device.name,
        targetPath: `/propriedades/${property.id}/areas/${area.id}/devices/${device.id}`,
    }
}
