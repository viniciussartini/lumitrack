import type { Request, Response, NextFunction } from "express"
import type { ReportService } from "@/modules/report/report.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class ReportController {
    constructor(private readonly reportService: ReportService) {}

    // GET /api/properties/:propertyId/report
    async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            // req.query carrega todos os query params como strings
            const result = await this.reportService.generate(propertyId, userId, req.query)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}