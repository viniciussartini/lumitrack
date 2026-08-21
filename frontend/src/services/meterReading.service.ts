import { api } from "@/services/api"
import type {
    ListMeterReadingsParams,
    MeterReadingBucket,
    MeterReadingGranularity,
} from "@/types/meterReading.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export interface MeterReadingListResponse {
    items: MeterReadingBucket[]
    granularity: MeterReadingGranularity
}

/**
 * Camada de acesso a `GET /api/meter-readings` (issue #211) — leituras
 * agregadas por minuto/hora, sem custo/tarifa. Ver `consumptionService`
 * para o equivalente de faturamento (granularidade hour+).
 */
export const meterReadingService = {
    list: async (params: ListMeterReadingsParams): Promise<MeterReadingListResponse> => {
        const { data } = await api.get<ApiEnvelope<MeterReadingListResponse>>("/meter-readings", {
            params,
        })
        return data.data
    },
}
