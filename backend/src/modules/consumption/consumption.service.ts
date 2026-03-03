import { z } from "zod"
import { createConsumptionSchema, updateConsumptionSchema, listConsumptionQuerySchema } from "@/modules/consumption/consumption.schema.js"
import type { ConsumptionRepository, ConsumptionResponse } from "@/modules/consumption/consumption.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { AlertService } from "../alert/alert.service.js"

export class ConsumptionService {
    constructor(
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,

        // DistributorRepository é necessário para buscar kwhPrice e calcular costBrl.
        private readonly distributorRepository: DistributorRepository,

        // Injetado para disparar alertas automaticamente.
        // AlertService não depende de ConsumptionService,
        // mas ConsumptionService pode notificar AlertService.
        private readonly alertService?: AlertService,
    ) {}

    // Helpers
    private parseAndValidateCreate(input: unknown) {
        const parsed = createConsumptionSchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }
        return parsed.data
    }

    // Verifica posse da propriedade e retorna o kwhPrice da distribuidora vinculada.
    // Todo cálculo de costBrl parte daqui — independente do target (property/area/device).
    private async validatePropertyAndGetKwhPrice(
        propertyId: string,
        userId: string,
    ): Promise<number> {
        const property = await this.propertyRepository.findById(propertyId)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const distributor = await this.distributorRepository.findById(property.distributorId)

        if (!distributor) {
            // Distributor deletado após o vínculo — situação excepcional
            throw new NotFoundError("Distribuidora vinculada não encontrada")
        }

        return distributor.kwhPrice
    }

    // Para targets de área e device, verifica se pertencem à property da URL
    private async validateAreaBelongsToProperty(areaId: string, propertyId: string): Promise<void> {
        const area = await this.areaRepository.findById(areaId)
        
        if (!area) {
            throw new NotFoundError("Área não encontrada")
        }

        if (area.propertyId !== propertyId) {
            throw new ForbiddenError("Área não pertence a esta propriedade")
        }
    }

    private async validateDeviceBelongsToArea(deviceId: string, areaId: string): Promise<void> {
        const device = await this.deviceRepository.findById(deviceId)

        if (!device) {
            throw new NotFoundError("Dispositivo não encontrado")
        }

        if (device.areaId !== areaId) {
            throw new ForbiddenError("Dispositivo não pertence a esta área")
        }
    }

    // Dispara alertas ativos cujo threshold é violado pelo kwhConsumed informado.
    // Fire-and-forget: erros no sistema de alertas não devem interromper o fluxo
    // principal de registro de consumo — análogo a um alarme que não pode travar
    // o funcionamento do equipamento que ele monitora.
    private async triggerAlerts(
        target: Parameters<AlertService["checkAndTrigger"]>[0],
        kwhConsumed: number,
    ): Promise<void> {
        if (this.alertService) {
            await this.alertService.checkAndTrigger(target, kwhConsumed)
        }
    }

    async createForProperty(
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<ConsumptionResponse> {
        const data = this.parseAndValidateCreate(input)
        const kwhPrice = await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        const existing = await this.consumptionRepository.findByTargetAndPeriod(
            { propertyId },
            data.period,
            data.referenceDate,
        )

        if (existing) {
            throw new ConflictError(
                `Já existe um registro ${data.period} para esta propriedade nesta data`,
            )
        }

        const costBrl = data.kwhConsumed * kwhPrice
        const record = await this.consumptionRepository.create({ propertyId }, data, costBrl)

        await this.triggerAlerts({ propertyId }, data.kwhConsumed)

        return record
    }

    async createForArea(
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<ConsumptionResponse> {
        const data = this.parseAndValidateCreate(input)
        const kwhPrice = await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)

        const existing = await this.consumptionRepository.findByTargetAndPeriod(
            { areaId },
            data.period,
            data.referenceDate,
        )

        if (existing) {
            throw new ConflictError(
                `Já existe um registro ${data.period} para esta área nesta data`,
            )
        }

        const costBrl = data.kwhConsumed * kwhPrice
        const record = await this.consumptionRepository.create({ areaId }, data, costBrl)

        await this.triggerAlerts({ areaId }, data.kwhConsumed)

        return record
    }

    async createForDevice(
        deviceId: string,
        areaId: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<ConsumptionResponse> {
        const data = this.parseAndValidateCreate(input)
        const kwhPrice = await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        await this.validateDeviceBelongsToArea(deviceId, areaId)

        const existing = await this.consumptionRepository.findByTargetAndPeriod(
            { deviceId },
            data.period,
            data.referenceDate,
        )

        if (existing) {
            throw new ConflictError(
                `Já existe um registro ${data.period} para este dispositivo nesta data`,
            )
        }

        const costBrl = data.kwhConsumed * kwhPrice
        const record = await this.consumptionRepository.create({ deviceId }, data, costBrl)

        await this.triggerAlerts({ deviceId }, data.kwhConsumed)

        return record
    }

    async findAllForProperty(
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<ConsumptionResponse[]> {
        await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        const { period } = listConsumptionQuerySchema.parse(query)
        return this.consumptionRepository.findAllByTarget({ propertyId }, period)
    }

    async findAllForArea(
        areaId: string,
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<ConsumptionResponse[]> {
        await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        const { period } = listConsumptionQuerySchema.parse(query)
        return this.consumptionRepository.findAllByTarget({ areaId }, period)
    }

    async findAllForDevice(
        deviceId: string,
        areaId: string,
        propertyId: string,
        userId: string,
        query: unknown,
    ): Promise<ConsumptionResponse[]> {
        await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        await this.validateAreaBelongsToProperty(areaId, propertyId)
        await this.validateDeviceBelongsToArea(deviceId, areaId)
        const { period } = listConsumptionQuerySchema.parse(query)
        return this.consumptionRepository.findAllByTarget({ deviceId }, period)
    }

    async findById(
        id: string,
        propertyId: string,
        userId: string,
    ): Promise<ConsumptionResponse> {
        await this.validatePropertyAndGetKwhPrice(propertyId, userId)
        const record = await this.consumptionRepository.findById(id)

        if (!record) {
            throw new NotFoundError("Registro de consumo não encontrado")
        }

        return record
    }

    async update(
        id: string,
        propertyId: string,
        userId: string,
        input: unknown,
    ): Promise<ConsumptionResponse> {
        const record = await this.findById(id, propertyId, userId)

        const parsed = updateConsumptionSchema.safeParse(input)
        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        // Recalcula costBrl se kwhConsumed foi alterado
        let newCostBrl: number | undefined = undefined

        if (parsed.data.kwhConsumed !== undefined) {
            const kwhPrice = await this.validatePropertyAndGetKwhPrice(propertyId, userId)
            newCostBrl = parsed.data.kwhConsumed * kwhPrice
        }

        const updated = await this.consumptionRepository.update(id, parsed.data, newCostBrl)

        // Verifica alertas após update se kwhConsumed foi alterado.
        // O target é inferido a partir do registro original.
        if (parsed.data.kwhConsumed !== undefined) {
            const kwhConsumed = parsed.data.kwhConsumed
            if (record.propertyId) await this.triggerAlerts({ propertyId: record.propertyId }, kwhConsumed)
            else if (record.areaId) await this.triggerAlerts({ areaId: record.areaId }, kwhConsumed)
            else if (record.deviceId) await this.triggerAlerts({ deviceId: record.deviceId }, kwhConsumed)
        }

        return updated
    }

    async delete(
        id: string,
        propertyId: string,
        userId: string,
    ): Promise<void> {
        await this.findById(id, propertyId, userId)
        await this.consumptionRepository.delete(id)
    }
}