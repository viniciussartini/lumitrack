import { api } from "@/services/api"
import type {
    BucketSize,
    ConsumptionBucket,
    ListConsumptionParams,
} from "@/types/consumption.types"
import type { Paginated } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export type ConsumptionListResponse = Paginated<ConsumptionBucket> & {
    granularity: BucketSize
}

/**
 * Camada de acesso à API de consumo agregado (reescrita da Fase 3 —
 * substitui o antigo CRUD manual de `ConsumptionRecord`).
 *
 * `GET /api/consumption` é somente leitura: agrega `MeterReading` por
 * bucket (minute/hour/day/month/year) do medidor vinculado ao alvo, dentro da
 * janela `from`/`to`.
 *
 * As datas viajam em ISO 8601 (UTC) — sem isso o axios serializaria o
 * `toString()` do Date, que o backend não consegue coagir.
 */
export const consumptionService = {
    list: async ({
        from,
        to,
        ...rest
    }: ListConsumptionParams): Promise<ConsumptionListResponse> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionListResponse>>("/consumption", {
            params: { ...rest, from: from?.toISOString(), to: to?.toISOString() },
        })
        return data.data
    },
}
