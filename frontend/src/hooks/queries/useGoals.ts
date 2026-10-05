import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/queryClient"
import { goalService } from "@/services/goal.service"
import type { Goal, GoalCreateInput, GoalUpdateInput } from "@/types/goal.types"
import { MAX_PAGE_SIZE, type Paginated } from "@/types/pagination.types"

/**
 * Metas de uma propriedade, todas elas: uma propriedade pode ter até três por
 * ano (uma por unidade), em anos até 2100, o que passa do teto de uma página
 * do backend. Pede as páginas seguintes enquanto faltar meta, para o
 * histórico e a checagem de ano repetido nunca ficarem incompletos.
 */
export const useGoals = (propertyId: string | null) =>
    useQuery({
        queryKey: queryKeys.goals.list(propertyId ?? ""),
        queryFn: () => listAllGoals(propertyId!),
        enabled: propertyId !== null,
    })

const listAllGoals = async (propertyId: string): Promise<Paginated<Goal>> => {
    const first = await goalService.list(propertyId, { page: 1, pageSize: MAX_PAGE_SIZE })
    const items = [...first.items]
    const pages = Math.ceil(first.total / first.pageSize)

    for (let page = 2; page <= pages; page++) {
        const next = await goalService.list(propertyId, { page, pageSize: MAX_PAGE_SIZE })
        items.push(...next.items)
    }

    return { ...first, items }
}

/** Estado do alerta de cada meta do ano corrente; invalidado junto da lista a cada mutação. */
export const useGoalAlerts = () =>
    useQuery({
        queryKey: queryKeys.goals.alerts,
        queryFn: () => goalService.alerts(),
    })

/** Acompanhamento das metas de uma propriedade; invalidado junto da lista a cada mutação. */
export const useGoalProgress = (propertyId: string | null) =>
    useQuery({
        queryKey: queryKeys.goals.progress(propertyId ?? ""),
        queryFn: () => goalService.progress(propertyId!),
        enabled: propertyId !== null,
    })

/**
 * Mutations das metas. Todas invalidam a lista e avisam o sucesso; o erro
 * fica com quem chama, que decide a mensagem.
 */

export const useCreateGoal = () => {
    const queryClient = useQueryClient()

    return useMutation<Goal, Error, GoalCreateInput>({
        mutationFn: (input) => goalService.create(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all })
            toast.success("Meta salva")
        },
    })
}

interface UpdateVariables {
    id: string
    input: GoalUpdateInput
}

export const useUpdateGoal = () => {
    const queryClient = useQueryClient()

    return useMutation<Goal, Error, UpdateVariables>({
        mutationFn: ({ id, input }) => goalService.update(id, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all })
            toast.success("Meta atualizada")
        },
    })
}

export const useDeleteGoal = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => goalService.remove(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all })
            toast.success("Meta excluída")
        },
    })
}
