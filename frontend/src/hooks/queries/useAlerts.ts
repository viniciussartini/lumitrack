import { useQuery } from "@tanstack/react-query"
import { alertService } from "@/services/alert.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"

/**
 * Inbox de alertas — recurso flat, paginado, vinculado direto a um medidor
 * (não aninhado sob property/area/device). Cada item já vem com `status`
 * ("firing"|"normal") e `target` resolvidos pelo backend.
 */
export const useAlerts = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.alerts.list(page, pageSize),
        queryFn: () => alertService.list({ page, pageSize }),
    })

/**
 * Alertas atualmente em disparo — hidratação inicial do WarningBadge
 * (o resto chega via SSE, evento `alert-firing`).
 */
export const useFiringAlerts = () =>
    useQuery({
        queryKey: queryKeys.alerts.firing(),
        queryFn: () => alertService.firing(),
    })

/**
 * KPI "alertas ativos" — evita pedir uma segunda página cheia de alertas
 * só para contar `enabled` no cliente.
 */
export const useAlertsStats = () =>
    useQuery({
        queryKey: queryKeys.alerts.stats(),
        queryFn: () => alertService.stats(),
    })

export const useAlert = (id: string | undefined) =>
    useQuery({
        queryKey: queryKeys.alerts.detail(id ?? ""),
        queryFn: () => alertService.getById(id!),
        enabled: Boolean(id),
    })
