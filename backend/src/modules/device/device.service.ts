import { createDeviceSchema, updateDeviceSchema } from "@/modules/device/device.schema.js"
import type { DeviceRepository, DeviceResponse } from "@/modules/device/device.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

export class DeviceService {
    constructor(
        private readonly deviceRepository: DeviceRepository,

        // AreaRepository e PropertyRepository são injetados para verificar
        // a cadeia completa de posse: userId → property → area → device.
        private readonly areaRepository: AreaRepository,
        private readonly propertyRepository: PropertyRepository,
    ) {}

    private async validateAreaOwnership(
        areaId: string,
        propertyId: string,
        userId: string,
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

    async create(
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<DeviceResponse> {
        const data = parseOrThrow(createDeviceSchema, input)

        await this.validateAreaOwnership(areaId, propertyId, userId)

        return this.deviceRepository.create(areaId, data)
    }

    async findById(
        id: string,
        areaId: string,
        propertyId: string,
        userId: string,
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

    async findAll(
        areaId: string,
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<Paginated<DeviceResponse>> {
        await this.validateAreaOwnership(areaId, propertyId, userId)

        const data = parseOrThrow(paginationQuerySchema, query)

        return this.deviceRepository.findAllByAreaPaginated(areaId, data)
    }

    async update(
        id: string,
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<DeviceResponse> {
        await this.findById(id, areaId, propertyId, userId)

        const data = parseOrThrow(updateDeviceSchema, input)

        return this.deviceRepository.update(id, data)
    }

    async delete(id: string, areaId: string, propertyId: string, userId: string): Promise<void> {
        await this.findById(id, areaId, propertyId, userId)
        await this.deviceRepository.delete(id)
    }
}
