import { z } from "zod"
import { createAlertSchema, updateAlertSchema, listAlertQuerySchema } from "@/modules/alert/alert.schema.js"
import type { AlertRepository, AlertResponse, AlertTarget } from "@/modules/alert/alert.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

export class AlertService {
    constructor(
        private readonly alertRepository: AlertRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    //  Helpers
    private parseAndValidateCreate(input: unknown) {
        const parsed = createAlertSchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }
        return parsed.data
    }

    private async validatePropertyOwnership(
        propertyId: string,
        userId: string,
    ): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)
        if (!property) throw new NotFoundError("Propriedade não encontrada")
        if (property.userId !== userId) throw new ForbiddenError("Acesso negado")
    }

    private async validateAreaBelongsToProperty(
        areaId: string,
        propertyId: string,
    ): Promise<void> {
        const area = await this.areaRepository.findById(areaId)
        if (!area) throw new NotFoundError("Área não encontrada")
        if (area.propertyId !== propertyId)
            throw new ForbiddenError("Área não pertence a esta propriedade")
    }

    private async validateDeviceBelongsToArea(
        deviceId: string,
        areaId: string,
    ): Promise<void> {
        const device = await this.deviceRepository.findById(deviceId)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")
        if (device.areaId !== areaId)
            throw new ForbiddenError("Dispositivo não pertence a esta área")
    }

    // Verifica posse do alerta e retorna-o — reutilizado em update/delete/read.
    private async getOwnedAlert(id: string, userId: string): Promise<AlertResponse> {
        const alert = await this.alertRepository.findById(id)
        if (!alert) throw new NotFoundError("Alerta não encontrado")
        if (alert.userId !== userId) throw new ForbiddenError("Acesso negado")
        return alert
    }

    // Criação por target (property/area/device) — valida hierarquia e posse antes de criar.
    async createForProperty(
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<AlertResponse> {
        const data = this.parseAndValidateCreate(input)
        await this.validatePropertyOwnership(propertyId, userId)
        return this.alertRepository.create(userId, { propertyId }, "PROPERTY", data)
    }

    async createForArea(
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<AlertResponse> {
        const data = this.parseAndValidateCreate(input)
        await this.validatePropertyOwnership(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        return this.alertRepository.create(userId, { areaId }, "AREA", data)
    }

    async createForDevice(
        deviceId: string,
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<AlertResponse> {
        const data = this.parseAndValidateCreate(input)
        await this.validatePropertyOwnership(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        await this.validateDeviceBelongsToArea(deviceId, areaId)
        return this.alertRepository.create(userId, { deviceId }, "DEVICE", data)
    }

    async findAll(userId: string, query: unknown): Promise<AlertResponse[]> {
        const { triggered } = listAlertQuerySchema.parse(query)
        return this.alertRepository.findAllByUser(userId, triggered)
    }

    async findAllForProperty(
        propertyId: string,
        userId: string,
    ): Promise<AlertResponse[]> {
        await this.validatePropertyOwnership(propertyId, userId)
        return this.alertRepository.findAllByTarget({ propertyId })
    }

    async findAllForArea(
        areaId: string,
        propertyId: string,
        userId: string,
    ): Promise<AlertResponse[]> {
        await this.validatePropertyOwnership(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        return this.alertRepository.findAllByTarget({ areaId })
    }

    async findAllForDevice(
        deviceId: string,
        areaId: string,
        propertyId: string,
        userId: string,
    ): Promise<AlertResponse[]> {
        await this.validatePropertyOwnership(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        await this.validateDeviceBelongsToArea(deviceId, areaId)
        return this.alertRepository.findAllByTarget({ deviceId })
    }

    async findById(id: string, userId: string): Promise<AlertResponse> {
        return this.getOwnedAlert(id, userId)
    }

    async update(
        id: string,
        userId: string,
        input: unknown,
    ): Promise<AlertResponse> {
        await this.getOwnedAlert(id, userId)

        const parsed = updateAlertSchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        return this.alertRepository.update(id, parsed.data)
    }

    async markAsRead(id: string, userId: string): Promise<AlertResponse> {
        await this.getOwnedAlert(id, userId)
        return this.alertRepository.markAsRead(id)
    }

    async delete(id: string, userId: string): Promise<void> {
        await this.getOwnedAlert(id, userId)
        await this.alertRepository.delete(id)
    }

    // Disparo automático
    // Chamado pelo ConsumptionService após cada create/update.
    // Verifica se kwhConsumed supera o thresholdKwh de algum alerta ativo
    // do target em questão. Se sim, preenche triggeredAt.
    async checkAndTrigger(
        target: AlertTarget,
        kwhConsumed: number,
    ): Promise<void> {
        const activeAlerts = await this.alertRepository.findActiveByTarget(target)

        for (const alert of activeAlerts) {
            if (kwhConsumed > alert.thresholdKwh) {
                await this.alertRepository.trigger(alert.id)
            }
        }
    }
}