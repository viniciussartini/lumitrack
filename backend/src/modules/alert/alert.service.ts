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

// CRUD de alertas por faixa de potência — cada alerta é um monitor
// contínuo de um medidor: dispara (e volta a disparar) quantas vezes
// a potência sair da faixa, enquanto `enabled`. `alertEvaluator` é opcional
// para permitir montar o service sem o singleton em contextos de teste que
// não precisam do status de disparo.
export class AlertService {
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

    // GET /api/alerts/stats — só o KPI "alertas ativos" do painel; evita que
    // o frontend precise pedir uma segunda página cheia de alertas (com todo
    // o custo de `withStatusAndTarget`) só pra contar `enabled` no cliente.
    async countEnabled(userId: string): Promise<number> {
        return this.alertRepository.countEnabledByUser(userId)
    }

    // GET /api/alerts/firing — hidratação inicial do badge de alertas em
    // disparo (o resto vem via SSE, evento alert-firing).
    async findFiring(userId: string): Promise<FiringAlert[]> {
        return this.alertEvaluator?.getFiringByUser(userId) ?? []
    }

    async findById(id: string, userId: string): Promise<AlertWithStatus> {
        const alert = await this.getOwnedAlert(id, userId)
        return this.withStatusAndTarget(alert)
    }

    async update(id: string, userId: string, input: unknown): Promise<AlertResponse> {
        await this.getOwnedAlert(id, userId)

        const data = parseOrThrow(updateAlertSchema, input)

        const updated = await this.alertRepository.update(id, data)
        await this.alertEvaluator?.invalidateMeter(updated.meterId)
        return updated
    }

    async patchEnabled(id: string, userId: string, input: unknown): Promise<AlertResponse> {
        const alert = await this.getOwnedAlert(id, userId)

        const data = parseOrThrow(patchEnabledSchema, input)

        const updated = await this.alertRepository.update(id, data)
        await this.alertEvaluator?.invalidateMeter(alert.meterId)
        return updated
    }

    async delete(id: string, userId: string): Promise<void> {
        const alert = await this.getOwnedAlert(id, userId)
        await this.alertRepository.delete(id)
        await this.alertEvaluator?.invalidateMeter(alert.meterId)
    }
}
