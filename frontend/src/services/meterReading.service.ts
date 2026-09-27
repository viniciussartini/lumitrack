import { api } from "@/services/api"
import type {
    ListMeterReadingsParams,
    MeterReadingBucket,
    MeterReadingGranularity,
} from "@/types/meterReading.types"
import type {
    MeterReadingSeriesBucket,
    MeterReadingSeriesMetric,
    MeterReadingSeriesParams,
    MeterReadingSeriesWindow,
} from "@/types/meterReadingSeries.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export interface MeterReadingListResponse {
    items: MeterReadingBucket[]
    granularity: MeterReadingGranularity
}

export interface MeterReadingSeriesResponse {
    items: MeterReadingSeriesBucket[]
    metric: MeterReadingSeriesMetric
    window: MeterReadingSeriesWindow
}

/**
 * Camada de acesso a `GET /api/meter-readings` — leituras agregadas por
 * minuto/hora, sem custo/tarifa. Ver `consumptionService` para o
 * equivalente de faturamento (granularidade hour+).
 */
export const meterReadingService = {
    list: async (params: ListMeterReadingsParams): Promise<MeterReadingListResponse> => {
        const { data } = await api.get<ApiEnvelope<MeterReadingListResponse>>("/meter-readings", {
            params,
        })
        return data.data
    },

    /**
     * `GET /api/meter-readings/series` — a área de análise configurável
     * (grandeza/janela/agregação, mínimo/média/máximo por balde), distinta
     * do gráfico "ao vivo" de `list`.
     *
     * @param params - Alvo, grandeza, janela e (só para `window="hora"`) hora/agregação.
     * @returns Os baldes da série, já na contagem fixa da janela pedida.
     */
    series: async (params: MeterReadingSeriesParams): Promise<MeterReadingSeriesResponse> => {
        const { data } = await api.get<ApiEnvelope<MeterReadingSeriesResponse>>(
            "/meter-readings/series",
            { params },
        )
        return data.data
    },
}
