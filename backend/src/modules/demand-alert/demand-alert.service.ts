import {
    createDemandAlertSchema,
    updateDemandAlertSchema,
    patchEnabledSchema,
    listDemandAlertQuerySchema,
} from "@/modules/demand-alert/demand-alert.schema.js"
import type {
    DemandAlertRepository,
    DemandAlertResponse,
} from "@/modules/demand-alert/demand-alert.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"

/**
 * CRUD de alertas de ultrapassagem de demanda contratada (Grupo A) — cada
 * alerta é uma configuração de limiar por medidor, avaliada 1x/minuto pelo
 * `DemandAlertScheduler` contra `MeterDemandRollup`, sem motor de episódio
 * (diferente de `AlertService`/`AlertEvaluator` — ver ADR-0020).
 */
export class DemandAlertService {
    /**
     * @param demandAlertRepository - Acesso a alertas persistidos.
     * @param meterRepository - Usado para validar, na criação, que o medidor existe, pertence ao usuário e sua propriedade é Grupo A numa modalidade com cálculo implementado.
     */
    constructor(
        private readonly demandAlertRepository: DemandAlertRepository,
        private readonly meterRepository: MeterRepository,
    ) {}

    private async getOwnedAlert(id: string, userId: string): Promise<DemandAlertResponse> {
        const alert = await this.demandAlertRepository.findById(id)
        if (!alert) {
            throw new NotFoundError("Alerta não encontrado")
        }
        if (alert.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        return alert
    }

    /**
     * Valida que um medidor existe, pertence ao usuário e sua propriedade
     * comporta o cálculo de demanda contratada — sem isso o alerta nunca
     * teria o que avaliar. Mesma dupla de mensagens de
     * `ConsumptionService.assertGroupACalculable`, reaproveitadas para que o
     * erro na criação do alerta e o erro do cálculo da conta falem a mesma
     * língua.
     *
     * @param meterId - Id do medidor informado na criação do alerta.
     * @param userId - Id do usuário autenticado.
     */
    private async assertMeterSupportsDemandAlert(meterId: string, userId: string): Promise<void> {
        const target = await this.meterRepository.findByIdWithTarget(meterId)
        if (!target?.property) {
            throw new NotFoundError("Medidor não encontrado")
        }
        if (target.property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        if (target.property.tariffGroup !== "GROUP_A") {
            throw new ValidationError(
                "Alerta de ultrapassagem de demanda só se aplica a propriedades do Grupo A",
            )
        }
        if (
            target.property.tariffModality !== "GREEN" &&
            target.property.tariffModality !== "BLUE"
        ) {
            throw new ValidationError(
                "Cálculo de conta do Grupo A ainda não suportado para esta modalidade tarifária",
            )
        }
    }

    /**
     * Cria um alerta de ultrapassagem de demanda para o medidor informado.
     *
     * @param userId - Id do usuário autenticado.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta criado.
     */
    async create(userId: string, input: unknown): Promise<DemandAlertResponse> {
        const data = parseOrThrow(createDemandAlertSchema, input)
        await this.assertMeterSupportsDemandAlert(data.meterId, userId)
        return this.demandAlertRepository.create(userId, data)
    }

    /**
     * Lista paginada dos alertas de ultrapassagem de demanda do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de alertas do usuário.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<DemandAlertResponse>> {
        const data = parseOrThrow(listDemandAlertQuerySchema, query)
        return this.demandAlertRepository.findAllByUserPaginated(userId, data)
    }

    /**
     * Detalhe de um alerta do titular.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @returns O alerta.
     */
    async findById(id: string, userId: string): Promise<DemandAlertResponse> {
        return this.getOwnedAlert(id, userId)
    }

    /**
     * Atualiza um alerta do titular. `meterId` é imutável — trocar de
     * medidor é criar um alerta novo, mesma regra de `AlertService.update`.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta atualizado.
     */
    async update(id: string, userId: string, input: unknown): Promise<DemandAlertResponse> {
        await this.getOwnedAlert(id, userId)
        const data = parseOrThrow(updateDemandAlertSchema, input)
        return this.demandAlertRepository.update(id, data)
    }

    /**
     * Liga/desliga um alerta do titular.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta atualizado.
     */
    async patchEnabled(id: string, userId: string, input: unknown): Promise<DemandAlertResponse> {
        await this.getOwnedAlert(id, userId)
        const data = parseOrThrow(patchEnabledSchema, input)
        return this.demandAlertRepository.update(id, data)
    }

    /**
     * Remove um alerta do titular.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     */
    async delete(id: string, userId: string): Promise<void> {
        await this.getOwnedAlert(id, userId)
        await this.demandAlertRepository.delete(id)
    }
}
