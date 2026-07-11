import type { Request, Response, NextFunction } from "express"
import type { AlertEventService } from "@/modules/alert-event/alert-event.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class AlertEventController {
    constructor(private readonly alertEventService: AlertEventService) {}

    // GET /api/alert-events?alertId=&page=&pageSize=
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.alertEventService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
