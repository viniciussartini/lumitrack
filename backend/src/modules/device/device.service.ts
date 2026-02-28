import { z } from "zod"
import { createDeviceSchema, updateDeviceSchema } from "@/modules/device/device.schema.js"
import type { DeviceRepository, DeviceResponse } from "@/modules/device/device.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class DeviceService {
    constructor(
        private readonly deviceRepository: DeviceRepository,

        // AreaRepository e PropertyRepository são injetados para verificar
        // a cadeia completa de posse: userId → property → area → device.
        private readonly areaRepository: AreaRepository,
        private readonly propertyRepository: PropertyRepository,
    ) {}

    private async validateAreaOwnership(areaId: string, propertyId: string, userId: string

    ): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const area = await this.areaRepository.findById(areaId)

        if (!area) {
            throw new NotFoundError("Área não encontrada")
        }

        if (area.propertyId !== propertyId) {
            throw new ForbiddenError("Área não pertence a esta propriedade")
        }
    }

    async create(areaId: string, propertyId: string, userId: string, input: unknown

    ): Promise<DeviceResponse> {
        const parsed = createDeviceSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        await this.validateAreaOwnership(areaId, propertyId, userId)

        return this.deviceRepository.create(areaId, parsed.data)
    }

    async findById(id: string, areaId: string, propertyId: string, userId: string

    ): Promise<DeviceResponse> {
        await this.validateAreaOwnership(areaId, propertyId, userId)

        const device = await this.deviceRepository.findById(id)

        if (!device) {
            throw new NotFoundError("Dispositivo não encontrado")
        }

        if (device.areaId !== areaId) {
            throw new ForbiddenError("Dispositivo não pertence a esta área")
        }

        return device
    }

    async findAll(areaId: string, propertyId: string, userId: string

    ): Promise<DeviceResponse[]> {
        await this.validateAreaOwnership(areaId, propertyId, userId)
        return this.deviceRepository.findAllByArea(areaId)
    }

    async update(id: string, areaId: string, propertyId: string, userId: string, input: unknown

    ): Promise<DeviceResponse> {
        await this.findById(id, areaId, propertyId, userId)

        const parsed = updateDeviceSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        return this.deviceRepository.update(id, parsed.data)
    }

    async delete(id: string, areaId: string, propertyId: string, userId: string

    ): Promise<void> {
        await this.findById(id, areaId, propertyId, userId)
        await this.deviceRepository.delete(id)
    }
}