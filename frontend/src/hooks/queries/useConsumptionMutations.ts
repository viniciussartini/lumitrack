import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import {
    formatKwh,
    formatReferenceDate,
} from "@/lib/formatters/consumption"
import type {
    ConsumptionRecord,
    CreateConsumptionInput,
    UpdateConsumptionInput,
} from "@/types/consumption.types"

/**
 * Mutations de Registros de Consumo.
 *
 * Regras gerais para todas as mutations:
 *   - onSuccess invalida queries afetadas (lista e/ou detalhe)
 *   - Toast de SUCESSO disparado AQUI
 *   - Erros NÃO disparam toast aqui — a página decide via try/catch +
 *     toast.error com mensagem contextual
 *
 * Sobre os 3 hooks `useCreate*`:
 *   Cada um sabe estaticamente qual lista invalidar (a do target específico
 *   via URL). Mesmo padrão dos services e queries — manter explícito evita
 *   ginástica de discriminated unions em call sites.
 *
 * Sobre `useUpdate` e `useDelete` invalidarem AMPLO (`["consumption","list"]`):
 *   As variables só têm (propertyId, id). O backend identifica o target pelo
 *   próprio registro armazenado, mas aqui no client não temos o registro em
 *   mãos antes de mutate (só depois, em `update`; nunca em `delete`).
 *
 *   Sem fazer um getById preliminar, não dá pra saber qual lista exata
 *   invalidar (property/area/device). O trade-off: algumas listas refetcham
 *   desnecessariamente, mas o volume de listas cacheadas em memória é
 *   pequeno (uma por target visualizado simultaneamente — geralmente 1-2)
 *   e refetch de consumo é leve.
 *
 *   Já o detalhe (queryKeys.consumption.detail(id)) é específico ao id e
 *   sempre invalidado/removido com precisão.
 *
 * Sobre buildDescription do toast:
 *   O backend retorna o registro completo em create/update — usamos isso
 *   pra mostrar "12,50 kWh em 15/01/2025" no toast. Em delete, não temos
 *   o registro (resposta é void), então só "Registro excluído" sem
 *   description.
 */

interface CreateForPropertyVariables {
    propertyId: string
    input: CreateConsumptionInput
}

export const useCreateConsumptionForProperty = () => {
    const queryClient = useQueryClient()

    return useMutation<
        ConsumptionRecord,
        Error,
        CreateForPropertyVariables
    >({
        mutationFn: ({ propertyId, input }) =>
            consumptionService.createForProperty(propertyId, input),
        onSuccess: (created, { propertyId }) => {
            queryClient.invalidateQueries({
                queryKey: [
                    ...queryKeys.consumption.all,
                    "list",
                    "property",
                    propertyId,
                ],
            })
            toast.success("Registro de consumo criado", {
                description: buildDescription(created),
            })
        },
    })
}

interface CreateForAreaVariables {
    propertyId: string
    areaId: string
    input: CreateConsumptionInput
}

export const useCreateConsumptionForArea = () => {
    const queryClient = useQueryClient()

    return useMutation<
        ConsumptionRecord,
        Error,
        CreateForAreaVariables
    >({
        mutationFn: ({ propertyId, areaId, input }) =>
            consumptionService.createForArea(propertyId, areaId, input),
        onSuccess: (created, { propertyId, areaId }) => {
            queryClient.invalidateQueries({
                queryKey: [
                    ...queryKeys.consumption.all,
                    "list",
                    "area",
                    propertyId,
                    areaId,
                ],
            })
            toast.success("Registro de consumo criado", {
                description: buildDescription(created),
            })
        },
    })
}

interface CreateForDeviceVariables {
    propertyId: string
    areaId: string
    deviceId: string
    input: CreateConsumptionInput
}

export const useCreateConsumptionForDevice = () => {
    const queryClient = useQueryClient()

    return useMutation<
        ConsumptionRecord,
        Error,
        CreateForDeviceVariables
    >({
        mutationFn: ({ propertyId, areaId, deviceId, input }) =>
            consumptionService.createForDevice(
                propertyId,
                areaId,
                deviceId,
                input,
            ),
        onSuccess: (created, { propertyId, areaId, deviceId }) => {
            queryClient.invalidateQueries({
                queryKey: [
                    ...queryKeys.consumption.all,
                    "list",
                    "device",
                    propertyId,
                    areaId,
                    deviceId,
                ],
            })
            toast.success("Registro de consumo criado", {
                description: buildDescription(created),
            })
        },
    })
}

interface UpdateConsumptionVariables {
    propertyId: string
    id: string
    input: UpdateConsumptionInput
}

export const useUpdateConsumption = () => {
    const queryClient = useQueryClient()

    return useMutation<
        ConsumptionRecord,
        Error,
        UpdateConsumptionVariables
    >({
        mutationFn: ({ propertyId, id, input }) =>
            consumptionService.update(propertyId, id, input),
        onSuccess: (updated, { id }) => {
            // Invalida AMPLO — vide JSDoc no topo
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.consumption.all, "list"],
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.consumption.detail(id),
            })
            toast.success("Registro atualizado", {
                description: buildDescription(updated),
            })
        },
    })
}

interface DeleteConsumptionVariables {
    propertyId: string
    id: string
}

export const useDeleteConsumption = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, DeleteConsumptionVariables>({
        mutationFn: ({ propertyId, id }) =>
            consumptionService.delete(propertyId, id),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.consumption.all, "list"],
            })
            // Remove do cache — registro não existe mais
            queryClient.removeQueries({
                queryKey: queryKeys.consumption.detail(id),
            })
            toast.success("Registro excluído")
        },
    })
}

/**
 * Constrói a description do toast.
 *
 * Exemplo: "12,50 kWh em 15/01/2025"
 *
 * NÃO inclui custo: em registros recém-criados, o backend pode estar
 * processando o cálculo (kwhPrice da distribuidora) — preferível mostrar
 * só o que o usuário acabou de informar.
 */
const buildDescription = (record: ConsumptionRecord): string =>
    `${formatKwh(record.kwhConsumed)} kWh em ${formatReferenceDate(
        record.referenceDate,
        record.period,
    )}`