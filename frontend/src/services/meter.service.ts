import { api } from "@/services/api"
import type { Meter, CreateMeterInput, UpdateMeterInput } from "@/types/meter.types"
import type { TargetType } from "@/types/meter.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de medidores (módulo novo da reformulação IoT).
 *
 * Recurso top-level (`/api/meters`), não aninhado — o alvo (propriedade,
 * área ou dispositivo) vem no próprio corpo/registro do medidor.
 */
export const meterService = {
    list: async (params: PaginationParams = {}): Promise<Paginated<Meter>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Meter>>>("/meters", { params })
        return data.data
    },

    byTarget: async (targetType: TargetType, targetId: string): Promise<Meter | null> => {
        try {
            const { data } = await api.get<ApiEnvelope<Meter>>("/meters/by-target", {
                params: { targetType, targetId },
            })
            return data.data
        } catch (error) {
            // 404 = alvo sem medidor vinculado — estado válido, não um erro.
            if (
                error &&
                typeof error === "object" &&
                "response" in error &&
                (error as { response?: { status?: number } }).response?.status === 404
            ) {
                return null
            }
            throw error
        }
    },

    getById: async (id: string): Promise<Meter> => {
        const { data } = await api.get<ApiEnvelope<Meter>>(`/meters/${id}`)
        return data.data
    },

    create: async (input: CreateMeterInput): Promise<Meter> => {
        const { data } = await api.post<ApiEnvelope<Meter>>("/meters", input)
        return data.data
    },

    update: async (id: string, input: UpdateMeterInput): Promise<Meter> => {
        const { data } = await api.put<ApiEnvelope<Meter>>(`/meters/${id}`, input)
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/meters/${id}`)
    },
}
