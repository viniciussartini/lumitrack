import { useQuery } from "@tanstack/react-query"
import { alertEventService } from "@/services/alert-event.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"

/**
 * Histórico paginado de episódios de disparo de um alerta específico.
 */
export const useAlertEvents = (
    alertId: string | undefined,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
) =>
    useQuery({
        queryKey: queryKeys.alertEvents.list(alertId ?? "", page, pageSize),
        queryFn: () => alertEventService.list({ alertId: alertId!, page, pageSize }),
        enabled: Boolean(alertId),
    })
