import { api } from "@/services/api"
import type { Distributor } from "@/types/distributor.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de distribuidoras.
 *
 * Reformulação IoT: distribuidora virou catálogo global somente leitura
 * (populado via seed) — sem mais create/update/delete nem escopo por
 * usuário. `list` é paginada.
 */
export const distributorService = {
    list: async (params: PaginationParams = {}): Promise<Paginated<Distributor>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Distributor>>>("/distributors", {
            params,
        })
        return data.data
    },

    getById: async (id: string): Promise<Distributor> => {
        const { data } = await api.get<ApiEnvelope<Distributor>>(`/distributors/${id}`)
        return data.data
    },
}
