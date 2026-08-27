import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notificationService } from "@/services/notification.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Notificações efêmeras — hidratação inicial do NotificationDropdown. O
 * restante chega via SSE (evento `notification`), que atualiza o cache
 * diretamente (ver RealtimeContext) em vez de invalidar/refetch.
 */
export const useNotifications = () =>
    useQuery({
        queryKey: queryKeys.notifications.list(),
        queryFn: () => notificationService.list(),
    })

export const useDeleteNotification = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => notificationService.delete(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all,
            })
        },
    })
}

export const useDeleteAllNotifications = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, void>({
        mutationFn: () => notificationService.deleteAll(),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all,
            })
        },
    })
}
