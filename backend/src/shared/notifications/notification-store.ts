import { randomUUID } from "crypto"
import type { TargetType } from "@/generated/prisma/client.js"

// Notificação efêmera — vive só na memória do processo (requisito
// explícito: sobrevive a reload de página, não a restart do servidor).
export type Notification = {
    id: string
    alertId: string
    alertName: string
    meterId: string
    targetType: TargetType
    targetPath: string // rota do frontend pronta para navegar (details page do alvo)
    message: string
    createdAt: Date
}

export type NewNotification = Omit<Notification, "id" | "createdAt">

// Cap por usuário — FIFO: ao ultrapassar, a notificação mais ANTIGA é
// descartada (não a que acabou de chegar).
const MAX_NOTIFICATIONS_PER_USER = 100

export class NotificationStore {
    private readonly byUser = new Map<string, Notification[]>()

    // Notificação mais recente sempre no início da lista.
    add(userId: string, input: NewNotification): Notification {
        const notification: Notification = {
            id: randomUUID(),
            createdAt: new Date(),
            ...input,
        }

        const list = this.byUser.get(userId) ?? []
        list.unshift(notification)

        if (list.length > MAX_NOTIFICATIONS_PER_USER) {
            list.length = MAX_NOTIFICATIONS_PER_USER
        }

        this.byUser.set(userId, list)
        return notification
    }

    findAllByUser(userId: string): Notification[] {
        return this.byUser.get(userId) ?? []
    }

    // "Lida" = excluída — não há estado read/unread.
    // Retorna false se a notificação não existe (já removida, ou nunca existiu).
    remove(userId: string, notificationId: string): boolean {
        const list = this.byUser.get(userId)
        if (!list) return false

        const index = list.findIndex((n) => n.id === notificationId)
        if (index === -1) return false

        list.splice(index, 1)
        return true
    }

    removeAll(userId: string): void {
        this.byUser.delete(userId)
    }
}
