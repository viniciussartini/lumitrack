import { Router, type RequestHandler } from "express"
import { NotificationController } from "@/modules/notification/notification.controller.js"
import { NotificationService } from "@/modules/notification/notification.service.js"
import type { NotificationStore } from "@/shared/notifications/notification-store.js"

export function notificationRoutes(authenticate: RequestHandler, notificationStore: NotificationStore): Router {
    const router = Router()

    const notificationService = new NotificationService(notificationStore)
    const controller = new NotificationController(notificationService)

    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => controller.delete(req, res, next))
    router.delete("/", authenticate, (req, res, next) => controller.deleteAll(req, res, next))

    return router
}
