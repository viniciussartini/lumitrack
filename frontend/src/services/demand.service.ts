import { api } from "@/services/api"
import type { DemandOverview } from "@/types/demand.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/** Camada de acesso a `/api/demand` — demanda medida contra a contratada do Grupo A. */
export const demandService = {
    /**
     * Demanda atual, máxima do mês, ultrapassagem e curva do dia de uma propriedade do Grupo A.
     *
     * @param propertyId - Propriedade do Grupo A.
     * @returns A visão de demanda.
     */
    overview: async (propertyId: string): Promise<DemandOverview> => {
        const { data } = await api.get<ApiEnvelope<DemandOverview>>("/demand/overview", {
            params: { propertyId },
        })
        return data.data
    },
}
