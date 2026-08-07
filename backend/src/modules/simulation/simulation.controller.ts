import type { Request, Response, NextFunction } from "express"
import type { SimulationService } from "@/modules/simulation/simulation.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class SimulationController {
    constructor(private readonly simulationService: SimulationService) {}

    // POST /api/properties/:propertyId/simulation
    // O target (PROPERTY, AREA, DEVICE) é definido pelo body — não pela URL.
    async simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const result = await this.simulationService.simulate(propertyId, userId, req.body)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
