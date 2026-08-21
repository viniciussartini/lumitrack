import type { Request, Response, NextFunction } from "express"
import type { MeterReadingService } from "@/modules/meter/meter-reading.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class MeterReadingController {
    constructor(private readonly meterReadingService: MeterReadingService) {}

    // GET /api/meter-readings?targetType=&targetId=&granularity=&from=&to=
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.meterReadingService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
