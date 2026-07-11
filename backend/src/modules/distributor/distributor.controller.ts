import type { Request, Response, NextFunction } from "express"
import type { DistributorService } from "@/modules/distributor/distributor.service.js"

export class DistributorController {
    constructor(private readonly distributorService: DistributorService) {}

    // GET /api/distributors?page=&pageSize= — Autenticado (catálogo global)
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.distributorService.findAll(req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/distributors/:id — Autenticado
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: distributorId } = req.params as { id: string }

            const distributor = await this.distributorService.findById(distributorId)

            res.status(200).json({ status: "success", data: distributor })
        } catch (error) {
            next(error)
        }
    }
}
