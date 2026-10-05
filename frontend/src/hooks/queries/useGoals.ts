import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/queryClient"
import { goalService } from "@/services/goal.service"
import type { Goal, GoalCreateInput, GoalUpdateInput } from "@/types/goal.types"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"

/**
 * Metas de uma propriedade, numa página só: o teto de 31 do backend supera
 * qualquer histórico real (o ano é único por propriedade).
 */
export const useGoals = (propertyId: string | null) =>
    useQuery({
        queryKey: queryKeys.goals.list(propertyId ?? ""),
        queryFn: () => goalService.list(propertyId!, { page: 1, pageSize: MAX_PAGE_SIZE }),
        enabled: propertyId !== null,
    })

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
