import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    CreatePropertyInput,
    Property,
    UpdatePropertyInput,
} from "@/types/property.types"

/**
 * Mutations de Propriedade.
 * 
 * Regras gerais para todas as mutations:
 *   - onSuccess invalida queries afetadas (lista e/ou detalhe)
 *   - Toast de sucesso é disparado AQUI, não na página
 *   - Erros NÃO disparam toast aqui — a página decide a mensagem,
 *     porque erros podem precisar de fraseado específico do contexto
 *     (ex: 403 quando trocou pra distribuidora de outro user).
 */

export const useCreateProperty = () => {
    const queryClient = useQueryClient()

    return useMutation<Property, Error, CreatePropertyInput>({
        mutationFn: (input) => propertyService.create(input),
        onSuccess: (created) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.properties.all,
            })
            toast.success("Propriedade criada", {
                description: `${created.name} foi adicionada com sucesso.`,
            })
        },
    })
}

interface UpdatePropertyVariables {
    id: string
    input: UpdatePropertyInput
}

export const useUpdateProperty = () => {
    const queryClient = useQueryClient()

    return useMutation<Property, Error, UpdatePropertyVariables>({
        mutationFn: ({ id, input }) => propertyService.update(id, input),
        onSuccess: (updated) => {
            // Invalida lista (ordem pode ter mudado) e o detalhe específico
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.properties.all, "list"],
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.properties.detail(updated.id),
            })
            toast.success("Propriedade atualizada", {
                description: `${updated.name} foi atualizada.`,
            })
        },
    })
}

/**
 * Delete de propriedade.
 *
 * Diferente de delete de Distribuidora (que tem regra de "não deletar
 * com propriedades vinculadas"), Property não tem essa restrição:
 * o backend faz cascade delete das Areas/Devices vinculados.
 *
 * Por isso aqui o toast de sucesso é simples e não há tratamento
 * especial de erro 4xx — quem chama trata erros via try/catch ou
 * onError callback.
 */
export const useDeleteProperty = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => propertyService.delete(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.properties.all, "list"],
            })
            // Remove o detalhe do cache — não vai existir mais
            queryClient.removeQueries({
                queryKey: queryKeys.properties.detail(id),
            })
            toast.success("Propriedade excluída")
        },
    })
}