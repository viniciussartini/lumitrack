import type { Request, Response, NextFunction } from "express"
import type { AreaService } from "@/modules/area/area.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class AreaController {
    constructor(private readonly areaService: AreaService) {}

    // POST /api/properties/:propertyId/areas
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.create(propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const areas = await this.areaService.findAll(propertyId, userId)
            res.status(200).json({ status: "success", data: areas })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.findById(areaId, propertyId, userId)
            res.status(200).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:propertyId/areas/:areaId
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.update(areaId, propertyId, userId, req.body)
            res.status(200).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:propertyId/areas/:areaId
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.areaService.delete(areaId, propertyId, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}