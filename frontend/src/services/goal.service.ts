import { api } from "@/services/api"
import type { Goal, GoalCreateInput, GoalProgress, GoalUpdateInput } from "@/types/goal.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/** Camada de acesso a `/api/goals` — metas anuais de consumo por propriedade. */
export const goalService = {
    /**
     * Metas de uma propriedade, do ano mais recente para o mais antigo.
     *
     * @param propertyId - Propriedade filtrada.
     * @param params - Página e tamanho da página.
     * @returns A página de metas.
     */
    list: async (propertyId: string, params: PaginationParams): Promise<Paginated<Goal>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Goal>>>("/goals", {
            params: { propertyId, ...params },
        })
        return data.data
    },

    /**
     * Acompanhamento de todas as metas de uma propriedade: realizado por mês,
     * desvio acumulado e situação.
     *
     * @param propertyId - Propriedade filtrada.
     * @returns Um item por meta, do ano mais recente ao mais antigo.
     */
    progress: async (propertyId: string): Promise<GoalProgress[]> => {
        const { data } = await api.get<ApiEnvelope<{ items: GoalProgress[] }>>("/goals/progress", {
            params: { propertyId },
        })
        return data.data.items
    },

    /**
     * Cria a meta de um ano para uma propriedade.
     *
     * @param input - Corpo da meta.
     * @returns A meta criada.
     */
    create: async (input: GoalCreateInput): Promise<Goal> => {
        const { data } = await api.post<ApiEnvelope<Goal>>("/goals", input)
        return data.data
    },

    /**
     * Substitui os valores editáveis de uma meta.
     *
     * @param id - Id da meta.
     * @param input - Novos valores, completos.
     * @returns A meta atualizada.
     */
    update: async (id: string, input: GoalUpdateInput): Promise<Goal> => {
        const { data } = await api.put<ApiEnvelope<Goal>>(`/goals/${id}`, input)
        return data.data
    },

    /**
     * Exclui uma meta.
     *
     * @param id - Id da meta.
     */
    remove: async (id: string): Promise<void> => {
        await api.delete(`/goals/${id}`)
    },
}
