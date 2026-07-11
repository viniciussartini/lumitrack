import { api } from "@/services/api"
import type {
    ConsumptionBucket,
    Granularity,
    ListConsumptionParams,
} from "@/types/consumption.types"
import type { Paginated } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export type ConsumptionListResponse = Paginated<ConsumptionBucket> & {
    granularity: Granularity
}

/**
 * Camada de acesso à API de consumo agregado (reescrita da Fase 3 —
 * substitui o antigo CRUD manual de `ConsumptionRecord`).
 *
 * `GET /api/consumption` é somente leitura: agrega `MeterReading` por
 * bucket (hour/day/month/year) do medidor vinculado ao alvo.
 */
export const consumptionService = {
    list: async (
        params: ListConsumptionParams,
    ): Promise<ConsumptionListResponse> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionListResponse>>(
            "/consumption",
            { params },
        )
        return data.data
    },
}
