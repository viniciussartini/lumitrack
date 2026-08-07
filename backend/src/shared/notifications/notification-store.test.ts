import { describe, it, expect } from "vitest"
import { NotificationStore } from "@/shared/notifications/notification-store.js"

function makeInput(overrides: Partial<Parameters<NotificationStore["add"]>[1]> = {}) {
    return {
        alertId: "alert-1",
        alertName: "Pico de potência",
        meterId: "meter-1",
        targetType: "PROPERTY" as const,
        targetPath: "/propriedades/prop-1",
        message: 'Alerta "Pico de potência" foi disparado. Clique aqui para ver.',
        ...overrides,
    }
}

describe("NotificationStore", () => {
    it("adiciona uma notificação com id e createdAt gerados", () => {
        const store = new NotificationStore()

        const notification = store.add("user-1", makeInput())

        expect(notification.id).toBeDefined()
        expect(notification.createdAt).toBeInstanceOf(Date)
        expect(notification.alertName).toBe("Pico de potência")
    })

    it("retorna lista vazia para usuário sem notificações", () => {
        const store = new NotificationStore()
        expect(store.findAllByUser("user-sem-notificacao")).toEqual([])
    })

    it("mais recente aparece primeiro na lista", () => {
        const store = new NotificationStore()

        const first = store.add("user-1", makeInput({ alertName: "Primeiro" }))
        const second = store.add("user-1", makeInput({ alertName: "Segundo" }))

        const list = store.findAllByUser("user-1")
        expect(list[0]!.id).toBe(second.id)
        expect(list[1]!.id).toBe(first.id)
    })

    it("isola notificações entre usuários diferentes", () => {
        const store = new NotificationStore()

        store.add("user-A", makeInput())
        store.add("user-B", makeInput())

        expect(store.findAllByUser("user-A")).toHaveLength(1)
        expect(store.findAllByUser("user-B")).toHaveLength(1)
    })

    it("descarta a notificação mais antiga ao ultrapassar o cap de 100 (FIFO)", () => {
        const store = new NotificationStore()

        const first = store.add("user-1", makeInput({ alertName: "Notificação 0" }))
        for (let i = 1; i < 100; i++) {
            store.add("user-1", makeInput({ alertName: `Notificação ${i}` }))
        }

        expect(store.findAllByUser("user-1")).toHaveLength(100)

        // A 101ª notificação deve descartar a mais antiga (a primeira criada).
        store.add("user-1", makeInput({ alertName: "Notificação 100" }))

        const list = store.findAllByUser("user-1")
        expect(list).toHaveLength(100)
        expect(list.some((n) => n.id === first.id)).toBe(false)
        expect(list[0]!.alertName).toBe("Notificação 100")
    })

    describe("remove", () => {
        it("remove a notificação e retorna true", () => {
            const store = new NotificationStore()
            const notification = store.add("user-1", makeInput())

            const removed = store.remove("user-1", notification.id)

            expect(removed).toBe(true)
            expect(store.findAllByUser("user-1")).toEqual([])
        })

        it("retorna false para notificação inexistente", () => {
            const store = new NotificationStore()
            store.add("user-1", makeInput())

            expect(store.remove("user-1", "id-inexistente")).toBe(false)
        })

        it("retorna false para usuário sem notificações", () => {
            const store = new NotificationStore()
            expect(store.remove("user-sem-notificacao", "qualquer-id")).toBe(false)
        })

        it("não remove notificação de outro usuário", () => {
            const store = new NotificationStore()
            const notification = store.add("user-A", makeInput())

            const removed = store.remove("user-B", notification.id)

            expect(removed).toBe(false)
            expect(store.findAllByUser("user-A")).toHaveLength(1)
        })
    })

    describe("removeAll", () => {
        it("remove todas as notificações de um usuário", () => {
            const store = new NotificationStore()
            store.add("user-1", makeInput())
            store.add("user-1", makeInput())

            store.removeAll("user-1")

            expect(store.findAllByUser("user-1")).toEqual([])
        })

        it("não afeta notificações de outro usuário", () => {
            const store = new NotificationStore()
            store.add("user-A", makeInput())
            store.add("user-B", makeInput())

            store.removeAll("user-A")

            expect(store.findAllByUser("user-B")).toHaveLength(1)
        })
    })
})
