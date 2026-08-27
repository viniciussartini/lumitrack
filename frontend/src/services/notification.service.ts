import { api } from "@/services/api"
import type { Notification } from "@/types/notification.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso às notificações efêmeras — não persistidas, vivem só na
 * memória do processo do backend. "Lida" = excluída.
 */
export const notificationService = {
    list: async (): Promise<Notification[]> => {
        const { data } = await api.get<ApiEnvelope<Notification[]>>("/notifications")
        return data.data
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/notifications/${id}`)
    },

    deleteAll: async (): Promise<void> => {
        await api.delete("/notifications")
    },
}
