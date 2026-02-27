import type { Request, Response, NextFunction } from "express"
import type { PropertyService } from "@/modules/property/property.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class PropertyController {
    constructor(private readonly propertyService: PropertyService) {}

    // POST /api/properties — Autenticado
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.create(userId, req.body)
            res.status(201).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties — Autenticado
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const properties = await this.propertyService.findAll(userId)
            res.status(200).json({ status: "success", data: properties })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:id — Autenticado
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.findById(propertyId, userId)
            res.status(200).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:id — Autenticado
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.update(propertyId, userId, req.body)
            res.status(200).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:id — Autenticado
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.propertyService.delete(propertyId, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}