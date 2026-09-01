import type { NotificationStore, Notification } from "@/shared/notifications/notification-store.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

/**
 * Notificações efêmeras — "lida" = excluída, sem estado read/unread. Não
 * persistidas: sobrevivem a reload de página, não a restart do servidor.
 */
export class NotificationService {
    /** @param notificationStore - Armazenamento em memória das notificações por usuário. */
    constructor(private readonly notificationStore: NotificationStore) {}

    /**
     * Lista as notificações pendentes de um usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @returns Notificações pendentes do usuário.
     */
    findAll(userId: string): Notification[] {
        return this.notificationStore.findAllByUser(userId)
    }

    /**
     * Remove uma notificação do usuário ("lida" = excluída).
     *
     * @param userId - Id do usuário autenticado (dono da notificação).
     * @param id - Id da notificação a remover.
     */
    delete(userId: string, id: string): void {
        const removed = this.notificationStore.remove(userId, id)
        if (!removed) {
            throw new NotFoundError("Notificação não encontrada")
        }
    }

    /**
     * Remove todas as notificações pendentes do usuário.
     *
     * @param userId - Id do usuário autenticado.
     */
    deleteAll(userId: string): void {
        this.notificationStore.removeAll(userId)
    }
}
