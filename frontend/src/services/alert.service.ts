import { api } from "@/services/api"
import type {
    Alert,
    CreateAlertInput,
    ListAlertQuery,
    UpdateAlertInput,
} from "@/types/alert.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Constrói a query string do filtro `?triggered=`. Retorna "" quando o
 * filtro é undefined — backend retorna todos os alertas.
 *
 * Encapsulado pra evitar repetir a ternária. Mesma decisão de design do
 * buildListQuery do consumption.service: uso direto de template literal
 * em vez de URLSearchParams porque é um param só, sem chars especiais.
 */
const buildGlobalQuery = (triggered?: boolean): string =>
    triggered === undefined ? "" : `?triggered=${triggered}`

/**
 * Camada de acesso à API de alertas.
 *
 * URLs do backend (referência rápida):
 *   POST   /api/properties/:propertyId/alerts                                       → createForProperty
 *   POST   /api/properties/:propertyId/areas/:areaId/alerts                          → createForArea
 *   POST   /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts        → createForDevice
 *   GET    /api/properties/:propertyId/alerts                                       → listByProperty
 *   GET    /api/properties/:propertyId/areas/:areaId/alerts                          → listByArea
 *   GET    /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts        → listByDevice
 *   GET    /api/alerts?triggered=true|false                                          → listGlobal
 *   GET    /api/alerts/:id                                                           → getById
 *   PUT    /api/alerts/:id                                                           → update
 *   PATCH  /api/alerts/:id/read                                                      → markAsRead
 *   DELETE /api/alerts/:id                                                           → delete
 *
 * Naming: `listBy*` espelha o consumption.service. `listGlobal` é único da
 * inbox em /alertas e mantém o nome explícito para evitar confusão.
 *
 * Filtro client-side, o inbox sempre chama listGlobal() sem
 * argumento; o filtro vira useMemo no componente. O parâmetro fica
 * disponível na assinatura para um eventual server-side futuro sem
 * quebrar callers.
 *
 * Envelope { status, data } é desmembrado aqui.
 */
export const alertService = {
    // Listagens

    listGlobal: async (query: ListAlertQuery = {}): Promise<Alert[]> => {
        const { data } = await api.get<ApiEnvelope<Alert[]>>(
            `/alerts${buildGlobalQuery(query.triggered)}`,
        )
        return data.data
    },

    listByProperty: async (propertyId: string): Promise<Alert[]> => {
        const { data } = await api.get<ApiEnvelope<Alert[]>>(
            `/properties/${propertyId}/alerts`,
        )
        return data.data
    },

    listByArea: async (
        propertyId: string,
        areaId: string,
    ): Promise<Alert[]> => {
        const { data } = await api.get<ApiEnvelope<Alert[]>>(
            `/properties/${propertyId}/areas/${areaId}/alerts`,
        )
        return data.data
    },

    listByDevice: async (
        propertyId: string,
        areaId: string,
        deviceId: string,
    ): Promise<Alert[]> => {
        const { data } = await api.get<ApiEnvelope<Alert[]>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/alerts`,
        )
        return data.data
    },

    getById: async (id: string): Promise<Alert> => {
        const { data } = await api.get<ApiEnvelope<Alert>>(`/alerts/${id}`)
        return data.data
    },

    // Mutations

    createForProperty: async (
        propertyId: string,
        input: CreateAlertInput,
    ): Promise<Alert> => {
        const { data } = await api.post<ApiEnvelope<Alert>>(
            `/properties/${propertyId}/alerts`,
            input,
        )
        return data.data
    },

    createForArea: async (
        propertyId: string,
        areaId: string,
        input: CreateAlertInput,
    ): Promise<Alert> => {
        const { data } = await api.post<ApiEnvelope<Alert>>(
            `/properties/${propertyId}/areas/${areaId}/alerts`,
            input,
        )
        return data.data
    },

    createForDevice: async (
        propertyId: string,
        areaId: string,
        deviceId: string,
        input: CreateAlertInput,
    ): Promise<Alert> => {
        const { data } = await api.post<ApiEnvelope<Alert>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${deviceId}/alerts`,
            input,
        )
        return data.data
    },

    update: async (id: string, input: UpdateAlertInput): Promise<Alert> => {
        const { data } = await api.put<ApiEnvelope<Alert>>(
            `/alerts/${id}`,
            input,
        )
        return data.data
    },

    markAsRead: async (id: string): Promise<Alert> => {
        const { data } = await api.patch<ApiEnvelope<Alert>>(
            `/alerts/${id}/read`,
        )
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/alerts/${id}`)
    },
}