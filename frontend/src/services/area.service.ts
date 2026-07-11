import { api } from "@/services/api"
import type {
    Area,
    CreateAreaInput,
    UpdateAreaInput,
} from "@/types/area.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de áreas.
 *
 * Diferente de propertyService/distributorService, todos os métodos exigem
 * um `propertyId` — a entidade é aninhada na URL
 * (/properties/:propertyId/areas[/:id]) e o backend não aceita áreas
 * desacopladas de propriedade.
 *
 * Só faz HTTP, sem lógica de cache (isso é dos hooks). O envelope
 * { status, data } é desmembrado aqui.
 */
export const areaService = {
    list: async (
        propertyId: string,
        params: PaginationParams = {},
    ): Promise<Paginated<Area>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Area>>>(
            `/properties/${propertyId}/areas`,
            { params },
        )
        return data.data
    },

    getById: async (propertyId: string, id: string): Promise<Area> => {
        const { data } = await api.get<ApiEnvelope<Area>>(
            `/properties/${propertyId}/areas/${id}`,
        )
        return data.data
    },

    create: async (
        propertyId: string,
        input: CreateAreaInput,
    ): Promise<Area> => {
        const { data } = await api.post<ApiEnvelope<Area>>(
            `/properties/${propertyId}/areas`,
            input,
        )
        return data.data
    },

    update: async (
        propertyId: string,
        id: string,
        input: UpdateAreaInput,
    ): Promise<Area> => {
        const { data } = await api.put<ApiEnvelope<Area>>(
            `/properties/${propertyId}/areas/${id}`,
            input,
        )
        return data.data
    },

    delete: async (propertyId: string, id: string): Promise<void> => {
        await api.delete(`/properties/${propertyId}/areas/${id}`)
    },
}
