import type { Request, Response, NextFunction } from "express"
import type { ReportScheduleService } from "@/modules/report-schedule/report-schedule.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das configurações de envio de relatório — delega toda a regra a {@link ReportScheduleService}. */
export class ReportScheduleController {
    /** @param service - Serviço de CRUD das configurações de envio. */
    constructor(private readonly service: ReportScheduleService) {}

    /**
     * `POST /api/report-schedules` — cria uma configuração.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const schedule = await this.service.create(userId, req.body)
            res.status(201).json({ status: "success", data: schedule })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/report-schedules?page=&pageSize=` — configurações do usuário.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.service.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/report-schedules/:id` — substitui uma configuração.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const schedule = await this.service.update(userId, req.params, req.body)
            res.status(200).json({ status: "success", data: schedule })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/report-schedules/:id` — exclui uma configuração.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.service.remove(userId, req.params)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
