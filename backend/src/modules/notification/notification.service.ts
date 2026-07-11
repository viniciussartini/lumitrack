import type { NotificationStore, Notification } from "@/shared/notifications/notification-store.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

// Notificações efêmeras (Fase 4) — "lida" = excluída, sem estado read/unread.
// Não persistidas: sobrevivem a reload de página, não a restart do servidor
// (requisito explícito do plano).
export class NotificationService {
    constructor(private readonly notificationStore: NotificationStore) {}

    findAll(userId: string): Notification[] {
        return this.notificationStore.findAllByUser(userId)
    }

    delete(userId: string, id: string): void {
        const removed = this.notificationStore.remove(userId, id)
        if (!removed) {
            throw new NotFoundError("Notificação não encontrada")
        }
    }

    deleteAll(userId: string): void {
        this.notificationStore.removeAll(userId)
    }
}
