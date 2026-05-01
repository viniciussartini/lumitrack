import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { distributorService } from "@/services/distributor.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    CreateDistributorInput,
    Distributor,
    UpdateDistributorInput,
} from "@/types/distributor.types"

/**
 * Mutations de Distribuidora.
 *
 * Padrão para todos os hooks:
 *   - onSuccess invalida queries afetadas (lista e/ou detalhe)
 *   - Toast de sucesso é disparado AQUI, não na página
 *   - Erros NÃO disparam toast aqui — a página decide a mensagem,
 *     porque erros de delete (ex: "tem propriedades vinculadas")
 *     pedem fraseado específico do contexto.
 *
 * Por que centralizar toasts de sucesso aqui?
 *   - Garantia de consistência: toda criação dispara o mesmo toast.
 *   - Evita esquecimento na página.
 *   - Se quisermos mudar o copy, é em um lugar só.
 */

export const useCreateDistributor = () => {
    const queryClient = useQueryClient()

    return useMutation<Distributor, Error, CreateDistributorInput>({
        mutationFn: (input) => distributorService.create(input),
        onSuccess: (created) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.distributors.all,
            })
            toast.success("Distribuidora criada", {
                description: `${created.name} foi adicionada com sucesso.`,
            })
        },
    })
}

interface UpdateDistributorVariables {
    id: string
    input: UpdateDistributorInput
}

export const useUpdateDistributor = () => {
    const queryClient = useQueryClient()

    return useMutation<Distributor, Error, UpdateDistributorVariables>({
        mutationFn: ({ id, input }) => distributorService.update(id, input),
        onSuccess: (updated) => {
            // Invalida lista (ordem pode ter mudado) e o detalhe específico
            queryClient.invalidateQueries({
                queryKey: queryKeys.distributors.list(),
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.distributors.detail(updated.id),
            })
            toast.success("Distribuidora atualizada", {
                description: `${updated.name} foi atualizada.`,
            })
        },
    })
}

export const useDeleteDistributor = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => distributorService.delete(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.distributors.list(),
            })
            // Remove o detalhe do cache — não vai existir mais
            queryClient.removeQueries({
                queryKey: queryKeys.distributors.detail(id),
            })
            toast.success("Distribuidora excluída")
        },
    })
}