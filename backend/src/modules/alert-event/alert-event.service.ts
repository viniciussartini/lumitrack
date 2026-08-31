import { listAlertEventQuerySchema } from "@/modules/alert-event/alert-event.schema.js"
import type { AlertRepository } from "@/modules/alert/alert.repository.js"
import type {
    AlertTriggerEventRepository,
    AlertTriggerEventResponse,
} from "@/modules/alert/alert-trigger-event.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"

// Histórico de episódios de disparo — somente leitura (o registro em si é
// escrito só pelo AlertEvaluator ao fechar um episódio).
export class AlertEventService {
    constructor(
        private readonly alertTriggerEventRepository: AlertTriggerEventRepository,
        private readonly alertRepository: AlertRepository,
    ) {}

    async list(userId: string, query: unknown): Promise<Paginated<AlertTriggerEventResponse>> {
        const { alertId, ...pagination } = parseOrThrow(listAlertEventQuerySchema, query)

        const alert = await this.alertRepository.findById(alertId)
        if (!alert) {
            throw new NotFoundError("Alerta não encontrado")
        }
        if (alert.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }

        return this.alertTriggerEventRepository.findAllByAlertPaginated(alertId, pagination)
    }
}
