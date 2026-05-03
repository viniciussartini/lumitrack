import { api } from "@/services/api"
import type {
    Property,
    CreatePropertyInput,
    UpdatePropertyInput,
} from "@/types/property.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de propriedades.
 *
 * Só faz HTTP, sem lógica de cache (isso é dos hooks).
 * O envelope { status, data } do backend são desmembrados aqui — quem usa o
 * service recebe direto a entidade.
 */
export const propertyService = {
    list: async (): Promise<Property[]> => {
        const { data } = await api.get<ApiEnvelope<Property[]>>(
            "/properties",
        )
        return data.data
    },

    getById: async (id: string): Promise<Property> => {
        const { data } = await api.get<ApiEnvelope<Property>>(
            `/properties/${id}`,
        )
        return data.data
    },

    create: async (input: CreatePropertyInput): Promise<Property> => {
        const { data } = await api.post<ApiEnvelope<Property>>(
            "/properties",
            input,
        )
        return data.data
    },

    update: async (
        id: string,
        input: UpdatePropertyInput,
    ): Promise<Property> => {
        const { data } = await api.put<ApiEnvelope<Property>>(
            `/properties/${id}`,
            input,
        )
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/properties/${id}`)
    },
}