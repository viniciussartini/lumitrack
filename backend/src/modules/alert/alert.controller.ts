import type { Request, Response, NextFunction } from "express"
import type { AlertService } from "@/modules/alert/alert.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class AlertController {
    constructor(private readonly alertService: AlertService) {}

    // POST /api/alerts
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.create(userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/alerts?page=&pageSize=
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.alertService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/alerts/firing
    async findFiring(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const firing = await this.alertService.findFiring(userId)
            res.status(200).json({ status: "success", data: firing })
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

    // PATCH /api/alerts/:id/enabled
    async patchEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.patchEnabled(id, userId, req.body)
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
}
