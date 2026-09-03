import { createDeviceSchema, updateDeviceSchema } from "@/modules/device/device.schema.js"
import type { DeviceRepository, DeviceResponse } from "@/modules/device/device.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

/** Regra de negócio de dispositivos — CRUD com validação da cadeia de posse (usuário → propriedade → área → device). */
export class DeviceService {
    /**
     * @param deviceRepository - Acesso a dispositivos persistidos.
     * @param areaRepository - Usado para verificar a cadeia completa de posse: userId → property → area → device.
     * @param propertyRepository - Usado para verificar a cadeia completa de posse: userId → property → area → device.
     */
    constructor(
        private readonly deviceRepository: DeviceRepository,
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

    /**
     * Cria um dispositivo na área informada, após validar a cadeia de posse.
     *
     * @param areaId - Id da área destino.
     * @param propertyId - Id da propriedade dona da área.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O dispositivo criado.
     */
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

    /**
     * Busca um dispositivo, validando a cadeia de posse e que ele de fato
     * pertence à área informada.
     *
     * @param id - Id do dispositivo.
     * @param areaId - Id da área esperada do dispositivo.
     * @param propertyId - Id da propriedade dona da área.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @returns O dispositivo encontrado.
     */
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

    /**
     * Lista paginada dos dispositivos de uma área, após validar a cadeia de posse.
     *
     * @param areaId - Id da área.
     * @param propertyId - Id da propriedade dona da área.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de dispositivos da área.
     */
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

    /**
     * Atualiza um dispositivo, após revalidar a cadeia de posse e a
     * existência do próprio dispositivo na área.
     *
     * @param id - Id do dispositivo a atualizar.
     * @param areaId - Id da área esperada do dispositivo.
     * @param propertyId - Id da propriedade dona da área.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O dispositivo atualizado.
     */
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

    /**
     * Remove um dispositivo, após revalidar a cadeia de posse e a
     * existência do próprio dispositivo na área.
     *
     * @param id - Id do dispositivo a remover.
     * @param areaId - Id da área esperada do dispositivo.
     * @param propertyId - Id da propriedade dona da área.
     * @param userId - Id do usuário autenticado (dono da propriedade).
     */
    async delete(id: string, areaId: string, propertyId: string, userId: string): Promise<void> {
        await this.findById(id, areaId, propertyId, userId)
        await this.deviceRepository.delete(id)
    }
}
