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
        const area = await areaRepository.findById(targetId)
        if (!area) throw new NotFoundError("Área não encontrada")
        const property = await propertyRepository.findById(area.propertyId)
        if (!property) throw new NotFoundError("Propriedade não encontrada")
        return property
    }

    const device = await deviceRepository.findById(targetId)
    if (!device) throw new NotFoundError("Dispositivo não encontrado")
    const area = await areaRepository.findById(device.areaId)
    if (!area) throw new NotFoundError("Área não encontrada")
    const property = await propertyRepository.findById(area.propertyId)
    if (!property) throw new NotFoundError("Propriedade não encontrada")
    return property
}
