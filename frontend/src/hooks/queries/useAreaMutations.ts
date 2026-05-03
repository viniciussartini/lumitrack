import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { areaService } from "@/services/area.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    Area,
    CreateAreaInput,
    UpdateAreaInput,
} from "@/types/area.types"

/**
 * Mutations de Área.
 *
 * Regras gerais para todas as mutations:
 *   - onSuccess invalida queries afetadas (lista e/ou detalhe)
 *   - Toast de SUCESSO disparado AQUI
 *   - Erros NÃO disparam toast aqui — a página decide (try/catch + toast.error
 *     com mensagem contextual)
 *
 * Diferença em relação aos outros hooks: todas as mutations precisam do
 * `propertyId` nas variables — entidade é aninhada na URL e na queryKey.
 *
 * Sobre o delete em cascade:
 *   O backend remove devices/consumption_records/alerts vinculados via
 *   ON DELETE CASCADE no Prisma. O hook não precisa fazer nada especial
 *   pra isso — é o usuário que confirma a ação ciente do impacto (vide
 *   AreaMenu, que mostra esse aviso explicitamente no ConfirmDialog).
 */

interface CreateAreaVariables {
    propertyId: string
    input: CreateAreaInput
}

export const useCreateArea = () => {
    const queryClient = useQueryClient()

    return useMutation<Area, Error, CreateAreaVariables>({
        mutationFn: ({ propertyId, input }) =>
            areaService.create(propertyId, input),
        onSuccess: (created) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.areas.list(created.propertyId),
            })
            toast.success("Área criada", {
                description: `${created.name} foi adicionada com sucesso.`,
            })
        },
    })
}

interface UpdateAreaVariables {
    propertyId: string
    areaId: string
    input: UpdateAreaInput
}

export const useUpdateArea = () => {
    const queryClient = useQueryClient()

    return useMutation<Area, Error, UpdateAreaVariables>({
        mutationFn: ({ propertyId, areaId, input }) =>
            areaService.update(propertyId, areaId, input),
        onSuccess: (updated) => {
            // Invalida lista (nome pode ter mudado, ordem pode ter mudado)
            // e o detalhe específico
            queryClient.invalidateQueries({
                queryKey: queryKeys.areas.list(updated.propertyId),
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.areas.detail(updated.propertyId, updated.id),
            })
            toast.success("Área atualizada", {
                description: `${updated.name} foi atualizada.`,
            })
        },
    })
}

interface DeleteAreaVariables {
    propertyId: string
    areaId: string
}

export const useDeleteArea = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, DeleteAreaVariables>({
        mutationFn: ({ propertyId, areaId }) =>
            areaService.delete(propertyId, areaId),
        onSuccess: (_, { propertyId, areaId }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.areas.list(propertyId),
            })
            // Remove o detalhe do cache — não vai mais existir
            queryClient.removeQueries({
                queryKey: queryKeys.areas.detail(propertyId, areaId),
            })
            toast.success("Área excluída")
        },
    })
}