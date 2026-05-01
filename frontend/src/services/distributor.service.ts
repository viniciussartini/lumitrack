import { api } from "@/services/api"
import type {
    Distributor,
    CreateDistributorInput,
    UpdateDistributorInput,
} from "@/types/distributor.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de distribuidoras.
 *
 * Nível "burro": só faz HTTP, sem lógica de cache (isso é dos hooks).
 * O envelope { status, data } do backend é descascado aqui — quem usa o
 * service recebe direto a entidade.
 */
export const distributorService = {
    list: async (): Promise<Distributor[]> => {
        const { data } = await api.get<ApiEnvelope<Distributor[]>>(
            "/distributors",
        )
        return data.data
    },

    getById: async (id: string): Promise<Distributor> => {
        const { data } = await api.get<ApiEnvelope<Distributor>>(
            `/distributors/${id}`,
        )
        return data.data
    },

    create: async (input: CreateDistributorInput): Promise<Distributor> => {
        const { data } = await api.post<ApiEnvelope<Distributor>>(
            "/distributors",
            input,
        )
        return data.data
    },

    update: async (
        id: string,
        input: UpdateDistributorInput,
    ): Promise<Distributor> => {
        const { data } = await api.put<ApiEnvelope<Distributor>>(
            `/distributors/${id}`,
            input,
        )
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/distributors/${id}`)
    },
}