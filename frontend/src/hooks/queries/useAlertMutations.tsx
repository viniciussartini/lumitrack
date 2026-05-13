import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { alertService } from "@/services/alert.service"
import { queryKeys } from "@/lib/queryClient"
import { formatThresholdKwh } from "@/lib/formatters/alert"
import type {
    Alert,
    CreateAlertInput,
    UpdateAlertInput,
} from "@/types/alert.types"

/**
 * Mutations de Alerta.
 *
 * Regras gerais:
 *   - onSuccess invalida queries afetadas
 *   - Toast de SUCESSO disparado AQUI
 *   - Erros NÃO disparam toast aqui — a página/menu decide via try/catch +
 *     toast.error com mensagem contextual (extractErrorMessage)
 *
 * Sobre os 3 hooks `useCreateAlertFor*`:
 *   Cada um sabe estaticamente qual lista invalidar (a do target específico).
 *   Espelha o pattern do useCreateConsumptionFor* — explicit é melhor que
 *   ginástica de discriminated union no call site.
 *
 * Sobre useUpdateAlert, useMarkAsRead e useDeleteAlert invalidarem AMPLO
 * (`queryKeys.alerts.all`):
 *   As variáveis dessas mutations só têm o `id` do alerta. Pra saber qual
 *   lista específica (property/area/device) invalidar, precisaríamos do
 *   targetType + targetId — info que está dentro do Alert retornado pelo
 *   PUT/PATCH (não em DELETE).
 *
 *   Trade-off: invalidar `alerts.all` em vez de tentar derivar
 *   a lista exata. Em prática, as listas cacheadas simultaneamente são
 *   poucas (1-2: a inbox global + a section da entity aberta), o refetch
 *   é leve, e o código fica muito mais simples.
 *
 *   Mesma decisão do useUpdateConsumption (invalida `consumption.all,list`).
 *
 * Sobre buildAlertDescription do toast:
 *   Toast de create/update inclui o threshold formatado ("100 kWh") como
 *   description. Delete não tem o registro (resposta void), então usa o
 *   threshold capturado ANTES da mutation (vide useDeleteAlert).
 */

const buildAlertDescription = (alert: Alert): string =>
    formatThresholdKwh(alert.thresholdKwh)

// Create (3 variantes — uma por target)

interface CreateForPropertyVariables {
    propertyId: string
    input: CreateAlertInput
}

export const useCreateAlertForProperty = () => {
    const queryClient = useQueryClient()

    return useMutation<Alert, Error, CreateForPropertyVariables>({
        mutationFn: ({ propertyId, input }) =>
            alertService.createForProperty(propertyId, input),
        onSuccess: (created, { propertyId }) => {
            // Invalida lista específica da property
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.byProperty(propertyId),
            })
            // Invalida inbox global (qualquer filtro)
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.alerts.all, "list", "global"],
            })
            toast.success("Alerta criado", {
                description: buildAlertDescription(created),
            })
        },
    })
}

interface CreateForAreaVariables {
    propertyId: string
    areaId: string
    input: CreateAlertInput
}

export const useCreateAlertForArea = () => {
    const queryClient = useQueryClient()

    return useMutation<Alert, Error, CreateForAreaVariables>({
        mutationFn: ({ propertyId, areaId, input }) =>
            alertService.createForArea(propertyId, areaId, input),
        onSuccess: (created, { propertyId, areaId }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.byArea(propertyId, areaId),
            })
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.alerts.all, "list", "global"],
            })
            toast.success("Alerta criado", {
                description: buildAlertDescription(created),
            })
        },
    })
}

interface CreateForDeviceVariables {
    propertyId: string
    areaId: string
    deviceId: string
    input: CreateAlertInput
}

export const useCreateAlertForDevice = () => {
    const queryClient = useQueryClient()

    return useMutation<Alert, Error, CreateForDeviceVariables>({
        mutationFn: ({ propertyId, areaId, deviceId, input }) =>
            alertService.createForDevice(
                propertyId,
                areaId,
                deviceId,
                input,
            ),
        onSuccess: (created, { propertyId, areaId, deviceId }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.byDevice(
                    propertyId,
                    areaId,
                    deviceId,
                ),
            })
            queryClient.invalidateQueries({
                queryKey: [...queryKeys.alerts.all, "list", "global"],
            })
            toast.success("Alerta criado", {
                description: buildAlertDescription(created),
            })
        },
    })
}

// Update

interface UpdateAlertVariables {
    id: string
    input: UpdateAlertInput
}

export const useUpdateAlert = () => {
    const queryClient = useQueryClient()

    return useMutation<Alert, Error, UpdateAlertVariables>({
        mutationFn: ({ id, input }) => alertService.update(id, input),
        onSuccess: (updated, { id }) => {
            // Invalida AMPLO — não temos como saber qual lista específica
            // sem fazer getById preliminar
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.all,
            })
            // Detalhe específico
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.detail(id),
            })
            toast.success("Alerta atualizado", {
                description: buildAlertDescription(updated),
            })
        },
    })
}

// Mark as Read

export const useMarkAlertAsRead = () => {
    const queryClient = useQueryClient()

    return useMutation<Alert, Error, string>({
        mutationFn: (id) => alertService.markAsRead(id),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.all,
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.detail(updated.id),
            })
            // Toast curto — ação é leve, não precisa de description
            toast.success("Marcado como lido")
        },
    })
}

// Delete

interface DeleteAlertVariables {
    id: string
    /**
     * Threshold capturado ANTES do delete pra mostrar no toast.
     *
     * Não é obrigatório — se omitido, cai no toast simples "Alerta excluído".
     */
    thresholdKwh?: number
}

export const useDeleteAlert = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, DeleteAlertVariables>({
        mutationFn: ({ id }) => alertService.delete(id),
        onSuccess: (_, { id, thresholdKwh }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.alerts.all,
            })
            // Remove o detalhe do cache — registro não existe mais
            queryClient.removeQueries({
                queryKey: queryKeys.alerts.detail(id),
            })

            // Toast contextual quando o threshold foi informado
            if (thresholdKwh !== undefined) {
                toast.success(
                    `Alerta de ${formatThresholdKwh(thresholdKwh)} excluído`,
                )
            } else {
                toast.success("Alerta excluído")
            }
        },
    })
}