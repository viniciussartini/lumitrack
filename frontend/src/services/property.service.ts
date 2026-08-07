import { api } from "@/services/api"
import type { Property, CreatePropertyInput, UpdatePropertyInput } from "@/types/property.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de propriedades.
 *
 * Só faz HTTP, sem lógica de cache (isso é dos hooks). O envelope
 * { status, data } do backend é desmembrado aqui — quem usa o service
 * recebe direto a entidade (ou o envelope paginado, em `list`).
 */
export const propertyService = {
    list: async (params: PaginationParams = {}): Promise<Paginated<Property>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Property>>>("/properties", { params })
        return data.data
    },

    getById: async (id: string): Promise<Property> => {
        const { data } = await api.get<ApiEnvelope<Property>>(`/properties/${id}`)
        return data.data
    },

    create: async (input: CreatePropertyInput): Promise<Property> => {
        const { data } = await api.post<ApiEnvelope<Property>>("/properties", input)
        return data.data
    },

    update: async (id: string, input: UpdatePropertyInput): Promise<Property> => {
        const { data } = await api.put<ApiEnvelope<Property>>(`/properties/${id}`, input)
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/properties/${id}`)
    },
}
