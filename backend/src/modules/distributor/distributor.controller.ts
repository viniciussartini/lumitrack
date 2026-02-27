import type { Request, Response, NextFunction } from "express"
import type { DistributorService } from "@/modules/distributor/distributor.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class DistributorController {
    constructor(private readonly distributorService: DistributorService) {}

    // POST /api/distributors — Autenticado
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user

            const distributor = await this.distributorService.create(userId, req.body)

            res.status(201).json({ status: "success", data: distributor })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/distributors — Autenticado
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user

            const distributors = await this.distributorService.findAll(userId)

            res.status(200).json({ status: "success", data: distributors })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/distributors/:id — Autenticado
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: distributorId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const distributor = await this.distributorService.findById(distributorId, userId)

            res.status(200).json({ status: "success", data: distributor })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/distributors/:id — Autenticado
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: distributorId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const distributor = await this.distributorService.update(distributorId, userId, req.body)

            res.status(200).json({ status: "success", data: distributor })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/distributors/:id — Autenticado
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: distributorId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.distributorService.delete(distributorId, userId)

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}