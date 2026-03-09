import { z } from "zod"
import { createIoTConfigSchema, updateIoTConfigSchema } from "@/modules/iot/iot.schema.js"
import type { IoTRepository, IoTConfigResponse } from "@/modules/iot/iot.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class IoTService {
    constructor(
        private readonly iotRepository:      IoTRepository,
        private readonly deviceRepository:    DeviceRepository,
        private readonly areaRepository:      AreaRepository,
        private readonly propertyRepository:  PropertyRepository,
    ) {}

    private async validateDeviceOwnership(
        deviceId:   string,
        areaId:     string,
        propertyId: string,
        userId:     string,
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

        const device = await this.deviceRepository.findById(deviceId)

        if (!device) {
            throw new NotFoundError("Dispositivo não encontrado")
        }

        if (device.areaId !== areaId) {
            throw new ForbiddenError("Dispositivo não pertence a esta área")
        }
    }

    async create(
        deviceId:   string,
        areaId:     string,
        propertyId: string,
        userId:     string,
        input:      unknown,
    ): Promise<IoTConfigResponse> {
        const parsed = createIoTConfigSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        await this.validateDeviceOwnership(deviceId, areaId, propertyId, userId)

        const existing = await this.iotRepository.findByDeviceId(deviceId)

        if (existing) {
            throw new ConflictError("Este dispositivo já possui uma configuração IoT")
        }

        return this.iotRepository.create(deviceId, parsed.data)
    }

    async findByDeviceId(
        deviceId:   string,
        areaId:     string,
        propertyId: string,
        userId:     string,
    ): Promise<IoTConfigResponse> {
        await this.validateDeviceOwnership(deviceId, areaId, propertyId, userId)
        const config = await this.iotRepository.findByDeviceId(deviceId)

        if (!config) {
            throw new NotFoundError("Configuração IoT não encontrada para este dispositivo")
        }

        return config
    }

    async update(
        deviceId:   string,
        areaId:     string,
        propertyId: string,
        userId:     string,
        input:      unknown,
    ): Promise<IoTConfigResponse> {
        const parsed = updateIoTConfigSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        await this.findByDeviceId(deviceId, areaId, propertyId, userId)

        return this.iotRepository.update(deviceId, parsed.data)
    }

    async delete(
        deviceId:   string,
        areaId:     string,
        propertyId: string,
        userId:     string,
    ): Promise<void> {
        await this.findByDeviceId(deviceId, areaId, propertyId, userId)
        await this.iotRepository.delete(deviceId)
    }
}