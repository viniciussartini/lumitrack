import { TargetType } from "@/generated/prisma/client.js"
import {
    createMeterSchema,
    updateMeterSchema,
    byTargetQuerySchema,
} from "@/modules/meter/meter.schema.js"
import type { CreateMeterInput, UpdateMeterInput } from "@/modules/meter/meter.schema.js"
import type {
    ConnectionConfigsResult,
    MeterRepository,
    MeterResponse,
} from "@/modules/meter/meter.repository.js"
import type { MeterConnectionConfig } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"
import { checkOutboundHost } from "@/shared/security/outboundHost.js"
import { env } from "@/config/env.js"

/**
 * Regras de negócio de medidores: posse do alvo (property/area/device),
 * unicidade de medidor por alvo, e proteção SSRF (OWASP A01) antes de
 * persistir host/port de conexão.
 */
export class MeterService {
    /**
     * @param meterRepository - Acesso a medidores persistidos.
     * @param propertyRepository - Usado para resolver a cadeia de posse até o userId, quando o alvo é uma propriedade.
     * @param areaRepository - Usado para resolver a cadeia de posse até o userId, quando o alvo é uma área.
     * @param deviceRepository - Usado para resolver a cadeia de posse até o userId, quando o alvo é um dispositivo.
     */
    constructor(
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
    ) {}

    // Resolve o userId dono do alvo, subindo a hierarquia até Property.
    private async resolveTargetOwnerId(targetType: TargetType, targetId: string): Promise<string> {
        if (targetType === "PROPERTY") {
            const property = await this.propertyRepository.findById(targetId)
            if (!property) throw new NotFoundError("Propriedade não encontrada")
            return property.userId
        }

        if (targetType === "AREA") {
            const area = await this.areaRepository.findById(targetId)
            if (!area) throw new NotFoundError("Área não encontrada")
            const property = await this.propertyRepository.findById(area.propertyId)
            if (!property) throw new NotFoundError("Propriedade não encontrada")
            return property.userId
        }

        // DEVICE
        const device = await this.deviceRepository.findById(targetId)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")
        const area = await this.areaRepository.findById(device.areaId)
        if (!area) throw new NotFoundError("Área não encontrada")
        const property = await this.propertyRepository.findById(area.propertyId)
        if (!property) throw new NotFoundError("Propriedade não encontrada")
        return property.userId
    }

    // Extrai o targetId do input de criação, validando que exatamente o FK
    // coerente com targetType foi informado (e nenhum outro).
    private extractTargetId(input: CreateMeterInput): string {
        if (input.targetType === "PROPERTY") {
            if (!input.propertyId)
                throw new ValidationError("propertyId é obrigatório para targetType PROPERTY")
            if (input.areaId || input.deviceId)
                throw new ValidationError("Informe apenas propertyId para targetType PROPERTY")
            return input.propertyId
        }

        if (input.targetType === "AREA") {
            if (!input.areaId)
                throw new ValidationError("areaId é obrigatório para targetType AREA")
            if (input.propertyId || input.deviceId)
                throw new ValidationError("Informe apenas areaId para targetType AREA")
            return input.areaId
        }

        if (!input.deviceId)
            throw new ValidationError("deviceId é obrigatório para targetType DEVICE")
        if (input.propertyId || input.areaId)
            throw new ValidationError("Informe apenas deviceId para targetType DEVICE")
        return input.deviceId
    }

    private async assertOwnership(meter: MeterResponse, userId: string): Promise<void> {
        const targetId = meter.propertyId ?? meter.areaId ?? meter.deviceId

        // Invariante de schema: exatamente um FK é preenchido por medidor.
        if (!targetId) throw new NotFoundError("Medidor sem alvo válido")

        const ownerId = await this.resolveTargetOwnerId(meter.targetType, targetId)
        if (ownerId !== userId) throw new ForbiddenError("Acesso negado")
    }

    // Proteção SSRF (OWASP A01): só os protocolos de rede (MQTT,
    // MODBUS_TCP, ETHERNET_IP, PROFINET) têm host/port — os seriais
    // (MODBUS_RTU, PROFIBUS, RS232, RS485) usam `address` e não abrem
    // socket de rede, então não passam por aqui. Recusa **antes de
    // persistir** — o controller dispara a conexão de saída logo após
    // create/update (inclusive no `restart` do update), então validar só
    // no adaptador de protocolo seria tarde demais.
    private async assertOutboundHostAllowed(
        input: CreateMeterInput | UpdateMeterInput,
    ): Promise<void> {
        if (input.host === undefined || input.port === undefined) return

        const result = await checkOutboundHost(input.host, input.port, env.IOT_ALLOWED_HOSTS)
        if (!result.allowed) {
            throw new ValidationError(result.reason ?? "Destino de conexão não permitido")
        }
    }

    /**
     * Cria um medidor, validando ownership do alvo, unicidade (um medidor
     * por alvo) e, quando aplicável, que o host/port de conexão é permitido.
     *
     * @param userId - Id do usuário autenticado (deve ser dono do alvo).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O medidor criado.
     */
    async create(userId: string, input: unknown): Promise<MeterResponse> {
        const data = parseOrThrow(createMeterSchema, input)

        await this.assertOutboundHostAllowed(data)

        const targetId = this.extractTargetId(data)
        const ownerId = await this.resolveTargetOwnerId(data.targetType, targetId)

        if (ownerId !== userId) throw new ForbiddenError("Acesso negado")

        const existing = await this.meterRepository.findByTarget(data.targetType, targetId)
        if (existing) throw new ConflictError("Este alvo já possui um medidor vinculado")

        return this.meterRepository.create(data)
    }

    /**
     * Lista paginada dos medidores do usuário autenticado.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de medidores do usuário.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<MeterResponse>> {
        const data = parseOrThrow(paginationQuerySchema, query)

        return this.meterRepository.findAllByUserPaginated(userId, data)
    }

    /**
     * Medidor vinculado a um alvo específico, restrito ao titular do alvo.
     *
     * @param userId - Id do usuário autenticado (deve ser dono do alvo).
     * @param query - Query string bruta (targetType + targetId), validada aqui.
     * @returns O medidor vinculado ao alvo.
     */
    async findByTargetQuery(userId: string, query: unknown): Promise<MeterResponse> {
        const data = parseOrThrow(byTargetQuerySchema, query)

        const ownerId = await this.resolveTargetOwnerId(data.targetType, data.targetId)
        if (ownerId !== userId) throw new ForbiddenError("Acesso negado")

        const meter = await this.meterRepository.findByTarget(data.targetType, data.targetId)
        if (!meter) throw new NotFoundError("Medidor não encontrado para este alvo")

        return meter
    }

    /**
     * Detalhe de um medidor, restrito ao titular do seu alvo.
     *
     * @param id - Id do medidor.
     * @param userId - Id do usuário autenticado (deve ser dono do alvo do medidor).
     * @returns O medidor encontrado.
     */
    async findById(id: string, userId: string): Promise<MeterResponse> {
        const meter = await this.meterRepository.findById(id)
        if (!meter) throw new NotFoundError("Medidor não encontrado")

        await this.assertOwnership(meter, userId)
        return meter
    }

    /**
     * Atualiza um medidor do titular, validando também o host/port de
     * conexão quando aplicável.
     *
     * @param id - Id do medidor a atualizar.
     * @param userId - Id do usuário autenticado (deve ser dono do alvo do medidor).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O medidor atualizado.
     */
    async update(id: string, userId: string, input: unknown): Promise<MeterResponse> {
        await this.findById(id, userId)

        const data = parseOrThrow(updateMeterSchema, input)

        await this.assertOutboundHostAllowed(data)

        return this.meterRepository.update(id, data)
    }

    /**
     * Remove um medidor do titular.
     *
     * @param id - Id do medidor a remover.
     * @param userId - Id do usuário autenticado (deve ser dono do alvo do medidor).
     */
    async delete(id: string, userId: string): Promise<void> {
        await this.findById(id, userId)
        await this.meterRepository.delete(id)
    }

    /**
     * Passagem fina para o worker IoT conectar de verdade (extra.password
     * decifrado). Sem checagem de ownership adicional: só é chamado logo
     * após create/update na mesma requisição (posse já validada) ou pelo
     * boot do servidor (infraestrutura de processo, não uma rota HTTP). O
     * controller não deve falar com MeterRepository diretamente, daí esta
     * passagem existir em vez de expor o repository.
     *
     * @param id - Id do medidor.
     * @returns A configuração de conexão do medidor, ou `null` se não existir.
     */
    async getConnectionConfig(id: string): Promise<MeterConnectionConfig | null> {
        return this.meterRepository.findConnectionConfigById(id)
    }

    /**
     * Configuração de conexão de todos os medidores cadastrados — usado no
     * boot do servidor para reconectar todos de uma vez. Medidores com
     * credencial indecifrável vêm à parte, em `skippedMeterIds`.
     *
     * @returns Os medidores com credencial decifrável, mais os ids dos descartados.
     */
    async getAllConnectionConfigs(): Promise<ConnectionConfigsResult> {
        return this.meterRepository.findAllConnectionConfigs()
    }
}
