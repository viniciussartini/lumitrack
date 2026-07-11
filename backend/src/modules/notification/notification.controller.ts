import type { Request, Response, NextFunction } from "express"
import type { NotificationService } from "@/modules/notification/notification.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class NotificationController {
    constructor(private readonly notificationService: NotificationService) {}

    // GET /api/notifications
    findAll(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const notifications = this.notificationService.findAll(userId)
            res.status(200).json({ status: "success", data: notifications })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/notifications/:id — "lida" = excluída
    delete(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            this.notificationService.delete(userId, id)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/notifications — limpa todas
    deleteAll(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            this.notificationService.deleteAll(userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
