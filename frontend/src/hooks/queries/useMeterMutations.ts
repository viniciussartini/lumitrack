import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { meterService } from "@/services/meter.service"
import { queryKeys } from "@/lib/queryClient"
import type { CreateMeterInput, Meter, UpdateMeterInput } from "@/types/meter.types"

/**
 * Mutations de Medidor.
 *
 * Mesmo padrão das demais mutations do projeto: toast de sucesso é
 * disparado aqui, erros ficam a cargo de quem chama (mensagem contextual).
 */

export const useCreateMeter = () => {
    const queryClient = useQueryClient()

    return useMutation<Meter, Error, CreateMeterInput>({
        mutationFn: (input) => meterService.create(input),
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.meters.all })
            toast.success("Medidor vinculado", {
                description: `${created.name} foi configurado com sucesso.`,
            })
        },
    })
}

interface UpdateMeterVariables {
    id: string
    input: UpdateMeterInput
}

export const useUpdateMeter = () => {
    const queryClient = useQueryClient()

    return useMutation<Meter, Error, UpdateMeterVariables>({
        mutationFn: ({ id, input }) => meterService.update(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.meters.all })
            toast.success("Medidor atualizado")
        },
    })
}

export const useDeleteMeter = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => meterService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.meters.all })
            toast.success("Medidor removido")
        },
    })
}
