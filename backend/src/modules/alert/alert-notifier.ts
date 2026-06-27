/** 
 * AlertNotifier — registro de listeners SSE para notificações de alertas
 * Ciclo de vida de um listener:
 * 1. Cliente abre GET /api/iot/stream
 * 2. iot-stream.routes chama alertNotifier.addListener(userId, fn)
 * 3. Quando AlertService dispara um alerta, chama alertNotifier.notify(alert)
 * 4. AlertNotifier encontra os listeners do userId e os chama
 * 5. Quando o cliente desconecta, a função de cleanup remove o listener
 */

import type { AlertResponse } from "@/modules/alert/alert.repository.js"
import { logger } from "@/shared/logger/logger.js"

export type AlertSseListener = (alert: AlertResponse) => void

export class AlertNotifier {
    private readonly listeners = new Map<string, Set<AlertSseListener>>()


    /**
     * Registra um listener para o userId.
     * Retorna uma função de cleanup que remove o listener quando chamada.
     * 
     * @param userId 
     * @param listener 
     * @returns 
     */
    addListener(userId: string, listener: AlertSseListener): () => void {
        let userListeners = this.listeners.get(userId)

        if (!userListeners) {
            userListeners = new Set()
            this.listeners.set(userId, userListeners)
        }

        userListeners.add(listener)

        return () => {
            const set = this.listeners.get(userId)
            if (!set) return
            set.delete(listener)
            if (set.size === 0) {
                this.listeners.delete(userId)
            }
        }
    }

    /**
     * Notifica todos os listeners do userId do alerta.
     * Chamado pelo AlertService imediatamente após disparar (trigger) um alerta.
     * Fire-and-forget por listener: um listener quebrado não impede os demais.
     * 
     * @param alert 
     * @returns 
     */
    notify(alert: AlertResponse): void {
        const userListeners = this.listeners.get(alert.userId)
        if (!userListeners || userListeners.size === 0) return

        for (const listener of userListeners) {
            try {
                listener(alert)
            } catch (err) {
                logger.error(
                    { module: "AlertNotifier", userId: alert.userId, err },
                    "Erro em listener SSE",
                )
            }
        }
    }

    
    /**
     * Retorna o número total de listeners ativos — útil para health checks e logs.
     * @returns 
     */
    activeListenerCount(): number {
        let count = 0
        for (const set of this.listeners.values()) {
            count += set.size
        }
        return count
    }
}