import type { TargetType } from "@/types/meter.types"

/**
 * Notificação efêmera — espelha `backend/src/shared/notifications/notification-store.ts`.
 * Vive só na memória do processo do backend: sobrevive a reload de página,
 * não a restart do servidor. "Lida" = excluída (não há estado read/unread).
 */
export interface Notification {
    id: string
    alertId: string
    alertName: string
    /** Nulo quando a origem não é um medidor (alerta de meta, que é da propriedade). */
    meterId: string | null
    targetType: TargetType
    /** Rota do frontend pronta para navegar (details page do alvo). */
    targetPath: string
    message: string
    createdAt: string
}
