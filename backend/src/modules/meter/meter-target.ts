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
//
// Uma única query (`findByIdWithTarget` resolve os 3 `include` possíveis
// no mesmo round trip) em vez dos até 3 lookups sequenciais que existiam
// antes — sem branch por `targetType` no lado da query, só na montagem do
// resultado.
export async function resolveMeterTarget(
    repos: MeterTargetRepos,
    meterId: string,
): Promise<MeterTargetInfo | null> {
    const result = await repos.meterRepository.findByIdWithTarget(meterId)
    if (!result) return null

    if (result.meter.targetType === "PROPERTY") {
        if (!result.property) return null
        return {
            ownerId: result.property.userId,
            targetType: "PROPERTY",
            targetName: result.property.name,
            targetPath: `/propriedades/${result.property.id}`,
        }
    }

    if (result.meter.targetType === "AREA") {
        if (!result.area || !result.property) return null
        return {
            ownerId: result.property.userId,
            targetType: "AREA",
            targetName: result.area.name,
            targetPath: `/propriedades/${result.property.id}/areas/${result.area.id}`,
        }
    }

    // DEVICE
    if (!result.device || !result.area || !result.property) return null
    return {
        ownerId: result.property.userId,
        targetType: "DEVICE",
        targetName: result.device.name,
        targetPath: `/propriedades/${result.property.id}/areas/${result.area.id}/devices/${result.device.id}`,
    }
}
