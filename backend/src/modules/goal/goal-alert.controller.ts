import type { Request, Response, NextFunction } from "express"
import type { GoalAlertService } from "@/modules/goal/goal-alert.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP do estado dos alertas de meta — delega toda a regra a {@link GoalAlertService}. */
export class GoalAlertController {
    /** @param service - Serviço do estado dos alertas de meta. */
    constructor(private readonly service: GoalAlertService) {}

    /**
     * `GET /api/goals/alerts` — estado do alerta de cada meta do ano corrente do usuário.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.service.list(userId)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
