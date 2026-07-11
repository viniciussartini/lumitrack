import { describe, it, expect, vi } from "vitest"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"

describe("UserEventHub", () => {
    it("deve chamar o listener com (event, payload) quando emit é chamado com o userId correto", () => {
        const hub = new UserEventHub()
        const listener = vi.fn()
        const userId = "user-abc"

        hub.addListener(userId, listener)
        hub.emit(userId, "alert-firing", { type: "start" })

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith("alert-firing", { type: "start" })
    })

    it("não deve chamar listener de outro userId", () => {
        const hub = new UserEventHub()
        const listenerA = vi.fn()
        const listenerB = vi.fn()

        hub.addListener("user-A", listenerA)
        hub.addListener("user-B", listenerB)

        hub.emit("user-A", "notification", { message: "oi" })

        expect(listenerA).toHaveBeenCalledOnce()
        expect(listenerB).not.toHaveBeenCalled()
    })

    it("deve chamar todos os listeners de um userId quando há múltiplas abas abertas", () => {
        const hub = new UserEventHub()
        const listenerA1 = vi.fn()
        const listenerA2 = vi.fn()
        const userId = "user-multi"

        hub.addListener(userId, listenerA1)
        hub.addListener(userId, listenerA2)

        hub.emit(userId, "notification", {})

        expect(listenerA1).toHaveBeenCalledOnce()
        expect(listenerA2).toHaveBeenCalledOnce()
    })

    it("deve remover o listener após chamar a função de cleanup", () => {
        const hub = new UserEventHub()
        const listener = vi.fn()
        const userId = "user-cleanup"

        const unsubscribe = hub.addListener(userId, listener)
        unsubscribe()

        hub.emit(userId, "notification", {})

        expect(listener).not.toHaveBeenCalled()
    })

    it("deve silenciosamente não fazer nada quando não há listeners para o userId", () => {
        const hub = new UserEventHub()
        expect(() => hub.emit("user-sem-listener", "notification", {})).not.toThrow()
    })

    it("deve continuar notificando outros listeners quando um lança exceção", () => {
        const hub = new UserEventHub()
        const listenerBroken = vi.fn().mockImplementation(() => {
            throw new Error("Listener quebrado")
        })
        const listenerOk = vi.fn()
        const userId = "user-error"

        hub.addListener(userId, listenerBroken)
        hub.addListener(userId, listenerOk)

        expect(() => hub.emit(userId, "notification", {})).not.toThrow()
        expect(listenerOk).toHaveBeenCalledOnce()
    })

    it("deve remover a entrada do Map quando o último listener é removido", () => {
        const hub = new UserEventHub()
        const listener = vi.fn()
        const userId = "user-gc"

        const unsubscribe = hub.addListener(userId, listener)
        expect(hub.activeListenerCount()).toBe(1)

        unsubscribe()
        expect(hub.activeListenerCount()).toBe(0)
    })

    it("deve reportar o total correto de listeners ativos entre múltiplos usuários", () => {
        const hub = new UserEventHub()

        const u1 = hub.addListener("user-1", vi.fn())
        const u2 = hub.addListener("user-2", vi.fn())
        hub.addListener("user-2", vi.fn()) // segunda aba do user-2

        expect(hub.activeListenerCount()).toBe(3)

        u1()
        expect(hub.activeListenerCount()).toBe(2)

        u2()
        expect(hub.activeListenerCount()).toBe(1)
    })
})
