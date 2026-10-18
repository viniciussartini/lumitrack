import type { Request, Response, NextFunction } from "express"
import type { DemandAlertService } from "@/modules/demand-alert/demand-alert.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de alertas de ultrapassagem de demanda contratada — delega toda a regra a {@link DemandAlertService}. */
export class DemandAlertController {
    /** @param demandAlertService - Serviço de CRUD de alertas de ultrapassagem de demanda. */
    constructor(private readonly demandAlertService: DemandAlertService) {}

    /**
     * `POST /api/demand-alerts` — cria um alerta para o usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.demandAlertService.create(userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/demand-alerts?page=&pageSize=` — lista paginada dos alertas
     * do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.demandAlertService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/demand-alerts/:id` — detalhe de um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.demandAlertService.findById(id, userId)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/demand-alerts/:id` — atualiza um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.demandAlertService.update(id, userId, req.body)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PATCH /api/demand-alerts/:id/enabled` — liga/desliga um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async patchEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.demandAlertService.patchEnabled(id, userId, req.body)
            res.status(200).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/demand-alerts/:id` — remove um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.demandAlertService.delete(id, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
