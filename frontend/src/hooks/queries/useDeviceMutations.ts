import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { deviceService } from "@/services/device.service"
import { queryKeys } from "@/lib/queryClient"
import type { Device, CreateDeviceInput, UpdateDeviceInput } from "@/types/device.types"

/**
 * Mutations de Dispositivo.
 *
 * Regras gerais para todas as mutations:
 *   - onSuccess invalida queries afetadas (lista e/ou detalhe)
 *   - Toast de SUCESSO disparado AQUI
 *   - Erros NÃO disparam toast aqui — a página decide (try/catch + toast.error
 *     com mensagem contextual)
 *
 * Diferença em relação aos outros hooks: todas as mutations precisam de
 * `propertyId` E `areaId` nas variables — entidade aninhada em 2 níveis.
 *
 * Sobre o delete em cascade:
 *   O backend remove consumption_records, alerts e iot_config vinculados
 *   via ON DELETE CASCADE no Prisma. O hook não precisa fazer nada
 *   especial — é o usuário que confirma a ação ciente do impacto (vide
 *   DeviceMenu, que mostra esse aviso explicitamente no ConfirmDialog).
 */

interface CreateDeviceVariables {
    propertyId: string
    areaId: string
    input: CreateDeviceInput
}

export const useCreateDevice = () => {
    const queryClient = useQueryClient()

    return useMutation<Device, Error, CreateDeviceVariables>({
        mutationFn: ({ propertyId, areaId, input }) =>
            deviceService.create(propertyId, areaId, input),
        onSuccess: (created, { propertyId, areaId }) => {
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.devices.all, "list", propertyId, areaId],
            })
            toast.success("Dispositivo criado", {
                description: `${created.name} foi adicionado com sucesso.`,
            })
        },
    })
}

interface UpdateDeviceVariables {
    propertyId: string
    areaId: string
    deviceId: string
    input: UpdateDeviceInput
}

export const useUpdateDevice = () => {
    const queryClient = useQueryClient()

    return useMutation<Device, Error, UpdateDeviceVariables>({
        mutationFn: ({ propertyId, areaId, deviceId, input }) =>
            deviceService.update(propertyId, areaId, deviceId, input),
        onSuccess: (updated, { propertyId, areaId }) => {
            // Invalida lista (nome pode ter mudado, ordem pode ter mudado)
            // e o detalhe específico
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.devices.all, "list", propertyId, areaId],
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.devices.detail(propertyId, areaId, updated.id),
            })
            toast.success("Dispositivo atualizado", {
                description: `${updated.name} foi atualizado.`,
            })
        },
    })
}

interface DeleteDeviceVariables {
    propertyId: string
    areaId: string
    deviceId: string
}

export const useDeleteDevice = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, DeleteDeviceVariables>({
        mutationFn: ({ propertyId, areaId, deviceId }) =>
            deviceService.delete(propertyId, areaId, deviceId),
        onSuccess: (_, { propertyId, areaId, deviceId }) => {
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.devices.all, "list", propertyId, areaId],
            })
            // Remove o detalhe do cache — não vai mais existir
            queryClient.removeQueries({
                queryKey: queryKeys.devices.detail(propertyId, areaId, deviceId),
            })
            toast.success("Dispositivo excluído")
        },
    })
}
