import type { Request, Response, NextFunction } from "express"
import type { TariffFlagService } from "@/modules/tariff-flag/tariff-flag.service.js"

export class TariffFlagController {
    constructor(private readonly tariffFlagService: TariffFlagService) {}

    // GET /api/tariff-flag — Autenticado (qualquer usuário; informativo)
    async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const config = await this.tariffFlagService.get()
            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/tariff-flag — Autenticado + requireRole("ADMIN")
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const config = await this.tariffFlagService.update(req.body)
            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }
}
