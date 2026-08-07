/**
 * UserEventHub — registro de listeners SSE por usuário, para qualquer evento
 * nomeado (generaliza o antigo `AlertNotifier`, que só sabia notificar
 * alertas). Usado hoje por dois eventos: `alert-firing` (AlertEvaluator) e
 * `notification` (idem, ao fechar um episódio). O evento `reading` continua
 * fora daqui — é por medidor, não por usuário, e já tem seu próprio
 * mecanismo em `IoTDataProcessor.addSampleListener`.
 *
 * Ciclo de vida de um listener:
 * 1. Cliente abre GET /api/iot/stream
 * 2. iot-stream.routes chama userEventHub.addListener(userId, fn)
 * 3. Qualquer parte do sistema chama userEventHub.emit(userId, evento, payload)
 * 4. O hub encontra os listeners do userId e os chama com (evento, payload)
 * 5. Quando o cliente desconecta, a função de cleanup remove o listener
 */

import { logger } from "@/shared/logger/logger.js"

export type UserEventListener = (event: string, payload: unknown) => void

export class UserEventHub {
    private readonly listeners = new Map<string, Set<UserEventListener>>()

    /**
     * Registra um listener para o userId.
     * Retorna uma função de cleanup que remove o listener quando chamada.
     */
    addListener(userId: string, listener: UserEventListener): () => void {
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
     * Emite um evento nomeado para todos os listeners do userId.
     * Fire-and-forget por listener: um listener quebrado não impede os demais.
     */
    emit(userId: string, event: string, payload: unknown): void {
        const userListeners = this.listeners.get(userId)
        if (!userListeners || userListeners.size === 0) return

        for (const listener of userListeners) {
            try {
                listener(event, payload)
            } catch (err) {
                logger.error({ module: "UserEventHub", userId, event, err }, "Erro em listener SSE")
            }
        }
    }

    /**
     * Retorna o número total de listeners ativos — útil para health checks e logs.
     */
    activeListenerCount(): number {
        let count = 0
        for (const set of this.listeners.values()) {
            count += set.size
        }
        return count
    }
}
