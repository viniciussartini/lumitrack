import type { Request, Response, NextFunction } from "express"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class ConsumptionController {
    constructor(private readonly consumptionService: ConsumptionService) {}

    // Property  
    // POST /api/properties/:propertyId/consumption
    async createForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const record = await this.consumptionService.createForProperty(propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: record })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/consumption
    async findAllForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const records = await this.consumptionService.findAllForProperty(propertyId, userId, req.query)
            res.status(200).json({ status: "success", data: records })
        } catch (error) {
            next(error)
        }
    }

    //  Area  
    // POST /api/properties/:propertyId/areas/:areaId/consumption
    async createForArea(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const record = await this.consumptionService.createForArea(areaId, propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: record })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/consumption
    async findAllForArea(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const records = await this.consumptionService.findAllForArea(areaId, propertyId, userId, req.query)
            res.status(200).json({ status: "success", data: records })
        } catch (error) {
            next(error)
        }
    }

    // Device  
    // POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption
    async createForDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId: string
                deviceId: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const record = await this.consumptionService.createForDevice(deviceId, areaId, propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: record })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption
    async findAllForDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId: string
                deviceId: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const records = await this.consumptionService.findAllForDevice(deviceId, areaId, propertyId, userId, req.query)
            res.status(200).json({ status: "success", data: records })
        } catch (error) {
            next(error)
        }
    }

    // Operações compartilhadas (contexto da property)
    // GET /api/properties/:propertyId/consumption/:id
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, id } = req.params as { propertyId: string; id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const record = await this.consumptionService.findById(id, propertyId, userId)
            res.status(200).json({ status: "success", data: record })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:propertyId/consumption/:id
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, id } = req.params as { propertyId: string; id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const record = await this.consumptionService.update(id, propertyId, userId, req.body)
            res.status(200).json({ status: "success", data: record })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:propertyId/consumption/:id
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, id } = req.params as { propertyId: string; id: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.consumptionService.delete(id, propertyId, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}