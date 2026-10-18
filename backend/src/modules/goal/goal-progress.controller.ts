import type { Request, Response, NextFunction } from "express"
import type { GoalProgressService } from "@/modules/goal/goal-progress.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP do acompanhamento das metas — delega toda a regra a {@link GoalProgressService}. */
export class GoalProgressController {
    /** @param service - Serviço do acompanhamento. */
    constructor(private readonly service: GoalProgressService) {}

    /**
     * `GET /api/goals/progress?propertyId=` — acompanhamento de todas as metas de uma propriedade.
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
}
