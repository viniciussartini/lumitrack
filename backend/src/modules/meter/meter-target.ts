import type { TargetType } from "@/generated/prisma/client.js"
import type { MeterRepository, MeterWithTargetRow } from "@/modules/meter/meter.repository.js"

// `findByIdWithTarget`/`findManyByIdsWithTarget` resolvem a cadeia inteira
// (medidor→propriedade/área/device) numa única query via `include`, então
// só o próprio `meterRepository` é necessário aqui — property/area/device
// deixaram de ser dependência direta.
export type MeterTargetRepos = {
    meterRepository: MeterRepository
}

export type MeterTargetInfo = {
    ownerId: string
    targetType: TargetType
    targetName: string
    targetPath: string
}

function toMeterTargetInfo(result: MeterWithTargetRow): MeterTargetInfo | null {
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
    return result ? toMeterTargetInfo(result) : null
}

// Versão em lote de `resolveMeterTarget` — uma única query para uma página
// inteira de medidores, qualquer mistura de `targetType`, substituindo o N+1
// de `AlertService.findAll` (até 1-3 round trips por alerta antes). Medidor
// sem entrada no Map resultante: não existe mais, ou seu alvo foi removido —
// o chamador trata como "sem alvo", mesma semântica do `null` do singular.
export async function resolveMeterTargets(
    repos: MeterTargetRepos,
    meterIds: string[],
): Promise<Map<string, MeterTargetInfo>> {
    const rows = await repos.meterRepository.findManyByIdsWithTarget(meterIds)

    const result = new Map<string, MeterTargetInfo>()
    for (const [meterId, row] of rows) {
        const info = toMeterTargetInfo(row)
        if (info) result.set(meterId, info)
    }
    return result
}
