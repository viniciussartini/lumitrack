import { api } from "@/services/api"
import type {
    BucketSize,
    ConsumptionBucket,
    ConsumptionSummaryItem,
    ConsumptionSummaryParams,
    ListConsumptionParams,
} from "@/types/consumption.types"
import type { AclComparisonParams, AclComparisonResponse } from "@/types/acl-comparison.types"
import type {
    BrancaComparisonParams,
    BrancaComparisonResponse,
} from "@/types/branca-comparison.types"
import type { Paginated } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export type ConsumptionListResponse = Paginated<ConsumptionBucket> & {
    granularity: BucketSize
}

export interface ConsumptionSummaryResponse {
    items: ConsumptionSummaryItem[]
}

/**
 * Camada de acesso à API de consumo agregado — substitui o antigo CRUD
 * manual de `ConsumptionRecord`.
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

    // Endpoint batch — o último bucket de N alvos do mesmo targetType numa
    // única requisição, substituindo o fan-out de N chamadas a `list()` que
    // os 3 pontos de comparação do produto faziam antes.
    summary: async ({
        ids,
        from,
        to,
        ...rest
    }: ConsumptionSummaryParams): Promise<ConsumptionSummaryResponse> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionSummaryResponse>>(
            "/consumption/summary",
            {
                params: {
                    ...rest,
                    ids: ids.join(","),
                    from: from?.toISOString(),
                    to: to?.toISOString(),
                },
            },
        )
        return data.data
    },

    // Comparação ACR × ACL — recalcula o mesmo consumo real medido nos dois
    // cenários. `from`/`to` viajam como data de calendário (00:00 local),
    // não ISO com hora — mesma convenção de `AclContract.validFrom/validTo`
    // no backend, que trunca para o primeiro dia do mês em vez de tratar
    // como instante UTC.
    compareAclToAcr: async ({
        propertyId,
        from,
        to,
    }: AclComparisonParams): Promise<AclComparisonResponse> => {
        const { data } = await api.get<ApiEnvelope<AclComparisonResponse>>(
            "/consumption/acl-comparison",
            {
                params: {
                    propertyId,
                    from: from.toISOString().slice(0, 10),
                    to: to.toISOString().slice(0, 10),
                },
            },
        )
        return data.data
    },

    // Comparação Convencional × Branca — mesma convenção de data de
    // calendário do compareAclToAcr acima.
    compareBrancaToConvencional: async ({
        propertyId,
        from,
        to,
    }: BrancaComparisonParams): Promise<BrancaComparisonResponse> => {
        const { data } = await api.get<ApiEnvelope<BrancaComparisonResponse>>(
            "/consumption/branca-comparison",
            {
                params: {
                    propertyId,
                    from: from.toISOString().slice(0, 10),
                    to: to.toISOString().slice(0, 10),
                },
            },
        )
        return data.data
    },
}
