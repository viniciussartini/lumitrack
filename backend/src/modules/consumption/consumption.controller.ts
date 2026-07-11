import type { Request, Response, NextFunction } from "express"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class ConsumptionController {
    constructor(private readonly consumptionService: ConsumptionService) {}

    // GET /api/consumption?targetType=&targetId=&granularity=&from=&to=&page=&pageSize=
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.consumptionService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
