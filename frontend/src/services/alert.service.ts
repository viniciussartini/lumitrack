import { api } from "@/services/api"
import type { AlertWithStatus, CreateAlertInput, UpdateAlertInput } from "@/types/alert.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de alertas.
 *
 * Recurso top-level (`/api/alerts`), vinculado direto a um `meterId`
 * (que já carrega o alvo) — sem rotas aninhadas sob property/area/device.
 */
export const alertService = {
    list: async (params: PaginationParams = {}): Promise<Paginated<AlertWithStatus>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<AlertWithStatus>>>("/alerts", {
            params,
        })
        return data.data
    },

    firing: async (): Promise<AlertWithStatus[]> => {
        const { data } = await api.get<ApiEnvelope<AlertWithStatus[]>>("/alerts/firing")
        return data.data
    },

    stats: async (): Promise<{ enabledCount: number }> => {
        const { data } = await api.get<ApiEnvelope<{ enabledCount: number }>>("/alerts/stats")
        return data.data
    },

    getById: async (id: string): Promise<AlertWithStatus> => {
        const { data } = await api.get<ApiEnvelope<AlertWithStatus>>(`/alerts/${id}`)
        return data.data
    },

    create: async (input: CreateAlertInput): Promise<AlertWithStatus> => {
        const { data } = await api.post<ApiEnvelope<AlertWithStatus>>("/alerts", input)
        return data.data
    },

    update: async (id: string, input: UpdateAlertInput): Promise<AlertWithStatus> => {
        const { data } = await api.put<ApiEnvelope<AlertWithStatus>>(`/alerts/${id}`, input)
        return data.data
    },

    patchEnabled: async (id: string, enabled: boolean): Promise<AlertWithStatus> => {
        const { data } = await api.patch<ApiEnvelope<AlertWithStatus>>(`/alerts/${id}/enabled`, {
            enabled,
        })
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/alerts/${id}`)
    },
}
