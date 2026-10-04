import type { Request, Response, NextFunction } from "express"
import type { GoalService } from "@/modules/goal/goal.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das metas de consumo — delega toda a regra a {@link GoalService}. */
export class GoalController {
    /** @param service - Serviço de CRUD das metas. */
    constructor(private readonly service: GoalService) {}

    /**
     * `POST /api/goals` — cria a meta de um ano para uma propriedade.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const goal = await this.service.create(userId, req.body)
            res.status(201).json({ status: "success", data: goal })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/goals?propertyId=&page=&pageSize=` — metas de uma propriedade.
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
     * `PUT /api/goals/:id` — substitui os valores editáveis de uma meta.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const goal = await this.service.update(userId, req.params, req.body)
            res.status(200).json({ status: "success", data: goal })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/goals/:id` — exclui uma meta.
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
