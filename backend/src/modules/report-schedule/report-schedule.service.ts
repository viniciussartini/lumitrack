import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import { computeNextRun } from "@/modules/report-schedule/nextRun.js"
import type {
    ReportScheduleRecord,
    ReportScheduleRepository,
    ReportScheduleWrite,
} from "@/modules/report-schedule/report-schedule.repository.js"
import {
    MAX_SCHEDULES_PER_USER,
    listReportSchedulesQuerySchema,
    reportScheduleBodySchema,
    reportScheduleIdParamsSchema,
    type ReportScheduleBody,
} from "@/modules/report-schedule/report-schedule.schema.js"
import { resolveRootProperty } from "@/shared/targetResolution.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import type { Paginated } from "@/shared/pagination.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

/** Configuração de envio como a API a devolve: sem `userId` nem o contador interno de falhas. */
export type ReportScheduleResponse = Omit<ReportScheduleRecord, "userId" | "failedAttempts"> & {
    /** `null` quando a configuração está pausada. */
    nextRunAt: Date | null
}

/**
 * CRUD das configurações de envio automático de relatório. Toda escrita
 * confere posse do alvo e existência do medidor — uma configuração que já
 * nasce inexequível falharia só na hora do envio.
 */
export class ReportScheduleService {
    /**
     * @param scheduleRepository - Persistência das configurações.
     * @param meterRepository - Confirma que o alvo tem medidor.
     * @param propertyRepository - Usado por {@link resolveRootProperty} para resolver a posse.
     * @param areaRepository - Usado por {@link resolveRootProperty}.
     * @param deviceRepository - Usado por {@link resolveRootProperty}.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly scheduleRepository: ReportScheduleRepository,
        private readonly meterRepository: MeterRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Cria uma configuração.
     *
     * @param userId - Id do usuário autenticado.
     * @param body - Corpo bruto, validado aqui.
     * @returns A configuração criada.
     * @throws {ValidationError} Se o usuário já está no teto de configurações.
     */
    async create(userId: string, body: unknown): Promise<ReportScheduleResponse> {
        const data = parseOrThrow(reportScheduleBodySchema, body)
        await this.assertTargetUsable(userId, data)

        if ((await this.scheduleRepository.countByUser(userId)) >= MAX_SCHEDULES_PER_USER) {
            throw new ValidationError(
                `Limite de ${MAX_SCHEDULES_PER_USER} configurações de envio atingido`,
            )
        }

        return this.toResponse(await this.scheduleRepository.create(userId, this.withNextRun(data)))
    }

    /**
     * Configurações do usuário, paginadas.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta (`page`, `pageSize`), validada aqui.
     * @returns Página de configurações, mais antigas primeiro.
     */
    async list(userId: string, query: unknown): Promise<Paginated<ReportScheduleResponse>> {
        const pagination = parseOrThrow(listReportSchedulesQuerySchema, query)
        const page = await this.scheduleRepository.findAllByUserPaginated(userId, pagination)
        return { ...page, items: page.items.map((item) => this.toResponse(item)) }
    }

    /**
     * Substitui uma configuração do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param params - Parâmetros de rota brutos (`id`), validados aqui.
     * @param body - Corpo bruto, validado aqui.
     * @returns A configuração atualizada.
     * @throws {NotFoundError} Configuração inexistente ou de outro usuário — indistinguíveis de propósito.
     */
    async update(userId: string, params: unknown, body: unknown): Promise<ReportScheduleResponse> {
        const { id } = parseOrThrow(reportScheduleIdParamsSchema, params)
        const data = parseOrThrow(reportScheduleBodySchema, body)
        await this.assertTargetUsable(userId, data)

        const updated = await this.scheduleRepository.update(id, userId, this.withNextRun(data))
        if (!updated) throw new NotFoundError("Configuração não encontrada")
        return this.toResponse(updated)
    }

    /**
     * Exclui uma configuração do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param params - Parâmetros de rota brutos (`id`), validados aqui.
     * @throws {NotFoundError} Configuração inexistente ou de outro usuário — indistinguíveis de propósito.
     */
    async remove(userId: string, params: unknown): Promise<void> {
        const { id } = parseOrThrow(reportScheduleIdParamsSchema, params)
        const deleted = await this.scheduleRepository.deleteByIdAndUser(id, userId)
        if (!deleted) throw new NotFoundError("Configuração não encontrada")
    }

    private async assertTargetUsable(userId: string, data: ReportScheduleBody): Promise<void> {
        const property = await resolveRootProperty(data.targetType, data.targetId, {
            propertyRepository: this.propertyRepository,
            areaRepository: this.areaRepository,
            deviceRepository: this.deviceRepository,
        })
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const meter = await this.meterRepository.findByTarget(data.targetType, data.targetId)
        if (!meter) {
            throw new NotFoundError("Este alvo não possui medidor vinculado")
        }
    }

    // Toda escrita recalcula a próxima execução a partir de agora: editar a
    // frequência ou reativar uma configuração pausada reancora o calendário.
    private withNextRun(data: ReportScheduleBody): ReportScheduleWrite {
        return {
            ...data,
            nextRunAt: data.active
                ? computeNextRun(data.frequency, data.sendDay, this.now())
                : null,
        }
    }

    private toResponse(record: ReportScheduleRecord): ReportScheduleResponse {
        const { userId: _owner, failedAttempts: _failures, ...rest } = record
        return { ...rest, nextRunAt: record.active ? record.nextRunAt : null }
    }
}
