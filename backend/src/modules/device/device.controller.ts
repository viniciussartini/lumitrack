import type { Request, Response, NextFunction } from "express"
import type { DeviceService } from "@/modules/device/device.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class DeviceController {
    constructor(private readonly deviceService: DeviceService) {}

    // POST /api/properties/:propertyId/areas/:areaId/devices
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.create(areaId, propertyId, userId, req.body)

            res.status(201).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/devices
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const devices = await this.deviceService.findAll(areaId, propertyId, userId)

            res.status(200).json({ status: "success", data: devices })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/devices/:id
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.findById(id, areaId, propertyId, userId)

            res.status(200).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:propertyId/areas/:areaId/devices/:id
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.update(id, areaId, propertyId, userId, req.body)

            res.status(200).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:propertyId/areas/:areaId/devices/:id
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.deviceService.delete(id, areaId, propertyId, userId)

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}