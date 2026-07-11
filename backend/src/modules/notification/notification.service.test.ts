import { describe, it, expect } from "vitest"
import { NotificationService } from "@/modules/notification/notification.service.js"
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

function makeInput() {
    return {
        alertId: "alert-1",
        alertName: "Pico de potência",
        meterId: "meter-1",
        targetType: "PROPERTY" as const,
        targetPath: "/propriedades/prop-1",
        message: "Alerta disparado",
    }
}

describe("NotificationService", () => {
    describe("findAll", () => {
        it("retorna as notificações do usuário", () => {
            const store = new NotificationStore()
            store.add("user-1", makeInput())
            const service = new NotificationService(store)

            expect(service.findAll("user-1")).toHaveLength(1)
        })

        it("retorna lista vazia para usuário sem notificações", () => {
            const service = new NotificationService(new NotificationStore())
            expect(service.findAll("user-1")).toEqual([])
        })
    })

    describe("delete", () => {
        it("remove a notificação", () => {
            const store = new NotificationStore()
            const notification = store.add("user-1", makeInput())
            const service = new NotificationService(store)

            service.delete("user-1", notification.id)

            expect(service.findAll("user-1")).toEqual([])
        })

        it("lança NotFoundError para notificação inexistente", () => {
            const service = new NotificationService(new NotificationStore())
            expect(() => service.delete("user-1", "id-inexistente")).toThrow(NotFoundError)
        })
    })

    describe("deleteAll", () => {
        it("remove todas as notificações do usuário", () => {
            const store = new NotificationStore()
            store.add("user-1", makeInput())
            store.add("user-1", makeInput())
            const service = new NotificationService(store)

            service.deleteAll("user-1")

            expect(service.findAll("user-1")).toEqual([])
        })
    })
})
