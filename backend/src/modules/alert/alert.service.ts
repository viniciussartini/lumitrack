import {
    createAlertSchema,
    updateAlertSchema,
    patchEnabledSchema,
    listAlertQuerySchema,
} from "@/modules/alert/alert.schema.js"
import type { AlertRepository, AlertResponse } from "@/modules/alert/alert.repository.js"
import type { AlertEvaluator, FiringAlert } from "@/modules/alert/alert-evaluator.js"
import {
    resolveMeterTarget,
    resolveMeterTargets,
    type MeterTargetInfo,
    type MeterTargetRepos,
} from "@/modules/meter/meter-target.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"
import type { TargetType } from "@/generated/prisma/client.js"

export type AlertWithStatus = AlertResponse & {
    status: "firing" | "normal"
    target: { type: TargetType; name: string; path: string } | null
}

/**
 * CRUD de alertas por faixa de potência — cada alerta é um monitor contínuo
 * de um medidor: dispara (e volta a disparar) quantas vezes a potência sair
 * da faixa, enquanto `enabled`.
 */
export class AlertService {
    /**
     * @param alertRepository - Acesso a alertas persistidos.
     * @param meterTargetRepos - Repositórios usados para resolver o medidor alvo de um alerta.
     * @param alertEvaluator - Motor de avaliação de disparo em memória. Opcional para permitir
     *   montar o service sem o singleton em contextos de teste que não precisam do status de disparo.
     */
    constructor(
        private readonly alertRepository: AlertRepository,
        private readonly meterTargetRepos: MeterTargetRepos,
        private readonly alertEvaluator?: AlertEvaluator,
    ) {}

    private async getOwnedAlert(id: string, userId: string): Promise<AlertResponse> {
        const alert = await this.alertRepository.findById(id)
        if (!alert) {
            throw new NotFoundError("Alerta não encontrado")
        }
        if (alert.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        return alert
    }

    private toAlertWithStatus(
        alert: AlertResponse,
        targetInfo: MeterTargetInfo | null,
    ): AlertWithStatus {
        return {
            ...alert,
            status: this.alertEvaluator?.isFiring(alert.id) ? "firing" : "normal",
            target: targetInfo
                ? {
                      type: targetInfo.targetType,
                      name: targetInfo.targetName,
                      path: targetInfo.targetPath,
                  }
                : null,
        }
    }

    private async withStatusAndTarget(alert: AlertResponse): Promise<AlertWithStatus> {
        const targetInfo = await resolveMeterTarget(this.meterTargetRepos, alert.meterId)
        return this.toAlertWithStatus(alert, targetInfo)
    }

    /**
     * Cria um alerta para o medidor informado, validando que ele existe e
     * pertence ao usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta criado.
     */
    async create(userId: string, input: unknown): Promise<AlertResponse> {
        const data = parseOrThrow(createAlertSchema, input)

        const targetInfo = await resolveMeterTarget(this.meterTargetRepos, data.meterId)
        if (!targetInfo) {
            throw new NotFoundError("Medidor não encontrado")
        }
        if (targetInfo.ownerId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        const alert = await this.alertRepository.create(userId, data)
        await this.alertEvaluator?.invalidateMeter(alert.meterId)
        return alert
    }

    /**
     * Lista paginada dos alertas do usuário, com status de disparo e alvo
     * resolvidos.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de alertas com status e alvo.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<AlertWithStatus>> {
        const data = parseOrThrow(listAlertQuerySchema, query)

        const result = await this.alertRepository.findAllByUserPaginated(userId, data)
        // Batch: 1 query pra página inteira (via `resolveMeterTargets`), em
        // vez de 1 chamada de `resolveMeterTarget` por alerta — evita até
        // 1-3 round trips extras por item.
        const meterIds = [...new Set(result.items.map((alert) => alert.meterId))]
        const targetMap = await resolveMeterTargets(this.meterTargetRepos, meterIds)
        const items = result.items.map((alert) =>
            this.toAlertWithStatus(alert, targetMap.get(alert.meterId) ?? null),
        )

        return { items, total: result.total, page: result.page, pageSize: result.pageSize }
    }

    /**
     * KPI "alertas ativos" do painel; evita que o frontend precise pedir uma
     * segunda página cheia de alertas (com todo o custo de
     * `withStatusAndTarget`) só pra contar `enabled` no cliente.
     *
     * @param userId - Id do usuário autenticado.
     * @returns Quantidade de alertas habilitados do usuário.
     */
    async countEnabled(userId: string): Promise<number> {
        return this.alertRepository.countEnabledByUser(userId)
    }

    /**
     * Hidratação inicial do badge de alertas em disparo (o resto vem via
     * SSE, evento alert-firing).
     *
     * @param userId - Id do usuário autenticado.
     * @returns Alertas do usuário atualmente em disparo.
     */
    async findFiring(userId: string): Promise<FiringAlert[]> {
        return this.alertEvaluator?.getFiringByUser(userId) ?? []
    }

    /**
     * Detalhe de um alerta do titular, com status de disparo e alvo
     * resolvidos.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @returns O alerta com status e alvo.
     */
    async findById(id: string, userId: string): Promise<AlertWithStatus> {
        const alert = await this.getOwnedAlert(id, userId)
        return this.withStatusAndTarget(alert)
    }

    /**
     * Atualiza um alerta do titular e invalida o cache de disparo do medidor.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta atualizado.
     */
    async update(id: string, userId: string, input: unknown): Promise<AlertResponse> {
        await this.getOwnedAlert(id, userId)

        const data = parseOrThrow(updateAlertSchema, input)

        const updated = await this.alertRepository.update(id, data)
        await this.alertEvaluator?.invalidateMeter(updated.meterId)
        return updated
    }

    /**
     * Liga/desliga um alerta do titular e invalida o cache de disparo do
     * medidor.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O alerta atualizado.
     */
    async patchEnabled(id: string, userId: string, input: unknown): Promise<AlertResponse> {
        const alert = await this.getOwnedAlert(id, userId)

        const data = parseOrThrow(patchEnabledSchema, input)

        const updated = await this.alertRepository.update(id, data)
        await this.alertEvaluator?.invalidateMeter(alert.meterId)
        return updated
    }

    /**
     * Remove um alerta do titular e invalida o cache de disparo do medidor.
     *
     * @param id - Id do alerta.
     * @param userId - Id do usuário autenticado (dono do alerta).
     */
    async delete(id: string, userId: string): Promise<void> {
        const alert = await this.getOwnedAlert(id, userId)
        await this.alertRepository.delete(id)
        await this.alertEvaluator?.invalidateMeter(alert.meterId)
    }
}
