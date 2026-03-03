import type { Request, Response, NextFunction } from "express"
import type { AlertService } from "@/modules/alert/alert.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class AlertController {
    constructor(private readonly alertService: AlertService) {}

    // GET /api/alerts
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const alerts = await this.alertService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: alerts })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/alerts/:id
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.findById(id, userId)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/alerts/:id
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.update(id, userId, req.body)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // PATCH /api/alerts/:id/read
    async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.markAsRead(id, userId)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/alerts/:id
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.alertService.delete(id, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    // POST /api/properties/:propertyId/alerts
    async createForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.createForProperty(propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/alerts
    async findAllForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alerts = await this.alertService.findAllForProperty(propertyId, userId)
            res.status(200).json({ status: "success", data: alerts })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/properties/:propertyId/areas/:areaId/alerts
    async createForArea(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.createForArea(areaId, propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/alerts
    async findAllForArea(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alerts = await this.alertService.findAllForArea(areaId, propertyId, userId)
            res.status(200).json({ status: "success", data: alerts })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts
    async createForDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string; areaId: string; deviceId: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.createForDevice(deviceId, areaId, propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts
    async findAllForDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string; areaId: string; deviceId: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alerts = await this.alertService.findAllForDevice(deviceId, areaId, propertyId, userId)
            res.status(200).json({ status: "success", data: alerts })
        } catch (error) {
            next(error)
        }
    }
}