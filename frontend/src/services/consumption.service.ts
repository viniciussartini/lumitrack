import { api } from "@/services/api"
import type {
    ConsumptionRecord,
    ConsumptionPeriod,
    CreateConsumptionInput,
    UpdateConsumptionInput,
} from "@/types/consumption.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Constrói a query string do filtro `?period=`. Retorna "" quando não há
 * filtro — assim o backend retorna todos os períodos.
 *
 * Encapsulado pra evitar repetir a ternária em 3 métodos `listBy*`. Não
 * uso URLSearchParams aqui porque é literalmente um único param e o
 * encoding de "DAILY" não tem caracteres especiais.
 */
const buildListQuery = (period?: ConsumptionPeriod): string =>
    period ? `?period=${period}` : ""

/**
 * Camada de acesso à API de Registros de Consumo.
 *
 * O backend é polimórfico via aninhamento de URL:
 *   target=PROPERTY → /api/properties/:propertyId/consumption
 *   target=AREA     → /api/properties/:propertyId/areas/:areaId/consumption
 *   target=DEVICE   → /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption
 *
 * Operações em registro único (getById/update/delete) sempre usam a rota
 * da property, mesmo para registros de area/device:
 *   /api/properties/:propertyId/consumption/:id
 *
 * O backend identifica o target pelo próprio registro armazenado.
 *
 * Há 3 funções `listBy*` em vez de uma genérica porque cada target tem
 * combinação distinta de IDs obrigatórios. Unificar exigiria type guards
 * runtime para um benefício zero — o consumidor sempre sabe estaticamente
 * em qual contexto está.
 *
 * Só HTTP, sem cache. O envelope
 * { status, data } é desmembrado aqui — quem usa recebe direto a entidade.
 */
export const consumptionService = {
    listByProperty: async (
        propertyId: string,
        period?: ConsumptionPeriod,
    ): Promise<ConsumptionRecord[]> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionRecord[]>>(
            `/properties/${propertyId}/consumption${buildListQuery(period)}`,
        )
        return data.data
    },

    listByArea: async (
        propertyId: string,
        areaId: string,
        period?: ConsumptionPeriod,
    ): Promise<ConsumptionRecord[]> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionRecord[]>>(
            `/properties/${propertyId}/areas/${areaId}/consumption${buildListQuery(period)}`,
        )
        return data.data
    },

    listByDevice: async (
        propertyId: string,
        areaId: string,
        deviceId: string,
        period?: ConsumptionPeriod,
    ): Promise<ConsumptionRecord[]> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionRecord[]>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption${buildListQuery(period)}`,
        )
        return data.data
    },

    getById: async (
        propertyId: string,
        id: string,
    ): Promise<ConsumptionRecord> => {
        const { data } = await api.get<ApiEnvelope<ConsumptionRecord>>(
            `/properties/${propertyId}/consumption/${id}`,
        )
        return data.data
    },

    createForProperty: async (
        propertyId: string,
        input: CreateConsumptionInput,
    ): Promise<ConsumptionRecord> => {
        const { data } = await api.post<ApiEnvelope<ConsumptionRecord>>(
            `/properties/${propertyId}/consumption`,
            input,
        )
        return data.data
    },

    createForArea: async (
        propertyId: string,
        areaId: string,
        input: CreateConsumptionInput,
    ): Promise<ConsumptionRecord> => {
        const { data } = await api.post<ApiEnvelope<ConsumptionRecord>>(
            `/properties/${propertyId}/areas/${areaId}/consumption`,
            input,
        )
        return data.data
    },

    createForDevice: async (
        propertyId: string,
        areaId: string,
        deviceId: string,
        input: CreateConsumptionInput,
    ): Promise<ConsumptionRecord> => {
        const { data } = await api.post<ApiEnvelope<ConsumptionRecord>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/consumption`,
            input,
        )
        return data.data
    },

    update: async (
        propertyId: string,
        id: string,
        input: UpdateConsumptionInput,
    ): Promise<ConsumptionRecord> => {
        const { data } = await api.put<ApiEnvelope<ConsumptionRecord>>(
            `/properties/${propertyId}/consumption/${id}`,
            input,
        )
        return data.data
    },

    delete: async (
        propertyId: string,
        id: string,
    ): Promise<void> => {
        await api.delete(`/properties/${propertyId}/consumption/${id}`)
    },
}