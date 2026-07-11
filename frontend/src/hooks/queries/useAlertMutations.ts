import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { alertService } from "@/services/alert.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    AlertWithStatus,
    CreateAlertInput,
    UpdateAlertInput,
} from "@/types/alert.types"

/**
 * Mutations de Alerta (Fase 5 — contrato flat, vinculado a um `meterId`).
 *
 * Regras gerais:
 *   - onSuccess invalida `alerts.all` (lista/detalhe/firing) — o volume de
 *     alertas por usuário é pequeno, invalidar amplo é barato e simples.
 *   - Toast de SUCESSO disparado AQUI; erros ficam a cargo de quem chama.
 */

export const useCreateAlert = () => {
    const queryClient = useQueryClient()

    return useMutation<AlertWithStatus, Error, CreateAlertInput>({
        mutationFn: (input) => alertService.create(input),
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
            toast.success("Alerta criado", {
                description: `${created.name} está monitorando o medidor.`,
            })
        },
    })
}

interface UpdateAlertVariables {
    id: string
    input: UpdateAlertInput
}

export const useUpdateAlert = () => {
    const queryClient = useQueryClient()

    return useMutation<AlertWithStatus, Error, UpdateAlertVariables>({
        mutationFn: ({ id, input }) => alertService.update(id, input),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
            toast.success("Alerta atualizado", {
                description: updated.name,
            })
        },
    })
}

interface PatchAlertEnabledVariables {
    id: string
    enabled: boolean
}

export const usePatchAlertEnabled = () => {
    const queryClient = useQueryClient()

    return useMutation<AlertWithStatus, Error, PatchAlertEnabledVariables>({
        mutationFn: ({ id, enabled }) => alertService.patchEnabled(id, enabled),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
            toast.success(
                updated.enabled ? "Alerta habilitado" : "Alerta desabilitado",
            )
        },
    })
}

export const useDeleteAlert = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => alertService.delete(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
            queryClient.removeQueries({ queryKey: queryKeys.alerts.detail(id) })
            toast.success("Alerta excluído")
        },
    })
}
