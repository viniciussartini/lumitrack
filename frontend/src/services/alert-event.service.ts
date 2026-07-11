import { api } from "@/services/api"
import type {
    AlertTriggerEvent,
    ListAlertEventParams,
} from "@/types/alert-event.types"
import type { Paginated } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso ao histórico de episódios de disparo — módulo novo
 * (Fase 4), somente leitura. Recurso top-level filtrado por `alertId`,
 * mesmo padrão de `consumption`/`meters`.
 */
export const alertEventService = {
    list: async (
        params: ListAlertEventParams,
    ): Promise<Paginated<AlertTriggerEvent>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<AlertTriggerEvent>>>(
            "/alert-events",
            { params },
        )
        return data.data
    },
}
