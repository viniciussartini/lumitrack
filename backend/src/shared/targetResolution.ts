import type { TargetType } from "@/generated/prisma/client.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

export interface TargetResolutionRepositories {
    propertyRepository: PropertyRepository
    areaRepository: AreaRepository
    deviceRepository: DeviceRepository
}

// Resolve a propriedade raiz de um alvo (ela mesma, ou subindo até ela) —
// é dela que vem o dono (checagem de ownership) e, para quem precisar,
// distribuidora/sistema elétrico/CIP. Compartilhado entre `ConsumptionService`
// e `MeterReadingService` — os dois precisam da mesma checagem de posse antes
// de agregar `MeterReading` de um medidor vinculado a PROPERTY/AREA/DEVICE.
//
// Cada ramo é uma única query (`findByIdWithProperty` resolve o `include`
// aninhado direto no repository) em vez dos até 3 round trips sequenciais
// que existiam antes. `Area.propertyId` e `Device.areaId` são FKs
// obrigatórias no schema — não existe estado em que a área/o device exista
// mas a propriedade não; por isso a única falha possível em cada ramo é o
// próprio id do alvo não existir, não um nível intermediário da cadeia.
export async function resolveRootProperty(
    targetType: TargetType,
    targetId: string,
    { propertyRepository, areaRepository, deviceRepository }: TargetResolutionRepositories,
): Promise<PropertyResponse> {
    if (targetType === "PROPERTY") {
        const property = await propertyRepository.findById(targetId)
        if (!property) throw new NotFoundError("Propriedade não encontrada")
        return property
    }

    if (targetType === "AREA") {
        const result = await areaRepository.findByIdWithProperty(targetId)
        if (!result) throw new NotFoundError("Área não encontrada")
        return result.property
    }

    const result = await deviceRepository.findByIdWithProperty(targetId)
    if (!result) throw new NotFoundError("Dispositivo não encontrado")
    return result.property
}
