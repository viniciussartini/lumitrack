import { describe, it, expect, vi } from "vitest"
import { AlertNotifier } from "@/modules/alert/alert-notifier.js"
import type { AlertResponse } from "@/modules/alert/alert.repository.js"

// ─── Helper ───────────────────────────────────────────────────────────────────
// Cria um AlertResponse mínimo para os testes — só preenchemos os campos
// que o AlertNotifier realmente usa (userId) e os obrigatórios do tipo.
function makeAlert(userId: string, overrides: Partial<AlertResponse> = {}): AlertResponse {
    return {
        id:           "alert-id-1",
        userId,
        targetType:   "PROPERTY",
        propertyId:   "property-id-1",
        areaId:       null,
        deviceId:     null,
        thresholdKwh: 100,
        message:      "Consumo alto",
        triggeredAt:  new Date(),
        readAt:       null,
        createdAt:    new Date(),
        updatedAt:    new Date(),
        ...overrides,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: AlertNotifier
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertNotifier", () => {

    it("deve chamar o listener quando notify é chamado com o userId correto", () => {
        const notifier = new AlertNotifier()
        const listener = vi.fn()
        const userId   = "user-abc"

        notifier.addListener(userId, listener)
        const alert = makeAlert(userId)
        notifier.notify(alert)

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith(alert)
    })

    it("não deve chamar listener de outro userId", () => {
        const notifier   = new AlertNotifier()
        const listenerA  = vi.fn()
        const listenerB  = vi.fn()

        notifier.addListener("user-A", listenerA)
        notifier.addListener("user-B", listenerB)

        notifier.notify(makeAlert("user-A"))

        expect(listenerA).toHaveBeenCalledOnce()
        // O listener do usuário B não deve ser chamado — o alerta é do usuário A.
        expect(listenerB).not.toHaveBeenCalled()
    })

    it("deve chamar todos os listeners de um userId quando há múltiplas abas abertas", () => {
        const notifier   = new AlertNotifier()
        const listenerA1 = vi.fn()
        const listenerA2 = vi.fn()
        const userId     = "user-multi"

        // Simula o mesmo usuário com duas abas abertas — dois listeners.
        notifier.addListener(userId, listenerA1)
        notifier.addListener(userId, listenerA2)

        notifier.notify(makeAlert(userId))

        expect(listenerA1).toHaveBeenCalledOnce()
        expect(listenerA2).toHaveBeenCalledOnce()
    })

    it("deve remover o listener após chamar a função de cleanup", () => {
        const notifier  = new AlertNotifier()
        const listener  = vi.fn()
        const userId    = "user-cleanup"

        const unsubscribe = notifier.addListener(userId, listener)

        // Remove o listener antes de notificar.
        unsubscribe()

        notifier.notify(makeAlert(userId))

        // O listener foi removido — não deve ser chamado.
        expect(listener).not.toHaveBeenCalled()
    })

    it("deve silenciosamente não fazer nada quando não há listeners para o userId", () => {
        const notifier = new AlertNotifier()

        // notify para um userId sem listeners não deve lançar exceção.
        expect(() => notifier.notify(makeAlert("user-sem-listener"))).not.toThrow()
    })

    it("deve continuar notificando outros listeners quando um lança exceção", () => {
        const notifier      = new AlertNotifier()
        const listenerBroken = vi.fn().mockImplementation(() => {
            throw new Error("Listener quebrado")
        })
        const listenerOk    = vi.fn()
        const userId        = "user-error"

        notifier.addListener(userId, listenerBroken)
        notifier.addListener(userId, listenerOk)

        // Não deve propagar a exceção do listener quebrado.
        expect(() => notifier.notify(makeAlert(userId))).not.toThrow()
        // O listener saudável deve ter sido chamado mesmo assim.
        expect(listenerOk).toHaveBeenCalledOnce()
    })

    it("deve remover a entrada do Map quando o último listener é removido", () => {
        const notifier = new AlertNotifier()
        const listener = vi.fn()
        const userId   = "user-gc"

        const unsubscribe = notifier.addListener(userId, listener)

        expect(notifier.activeListenerCount()).toBe(1)

        unsubscribe()

        // Após remover o único listener, o count deve ser 0.
        expect(notifier.activeListenerCount()).toBe(0)
    })

    it("deve reportar o total correto de listeners ativos entre múltiplos usuários", () => {
        const notifier = new AlertNotifier()

        const u1 = notifier.addListener("user-1", vi.fn())
        const u2 = notifier.addListener("user-2", vi.fn())
               notifier.addListener("user-2", vi.fn()) // segunda aba do user-2

        expect(notifier.activeListenerCount()).toBe(3)

        u1()  // remove listener do user-1
        expect(notifier.activeListenerCount()).toBe(2)

        u2()  // remove uma das duas abas do user-2
        expect(notifier.activeListenerCount()).toBe(1)
    })
})