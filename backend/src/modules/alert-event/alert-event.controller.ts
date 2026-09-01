import type { Request, Response, NextFunction } from "express"
import type { AlertEventService } from "@/modules/alert-event/alert-event.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP do histórico de disparos de alerta — delega toda a regra a {@link AlertEventService}. */
export class AlertEventController {
    /** @param alertEventService - Serviço de histórico de disparos, composto manualmente nas rotas do módulo. */
    constructor(private readonly alertEventService: AlertEventService) {}

    /**
     * `GET /api/alert-events?alertId=&page=&pageSize=` — histórico paginado
     * de disparos, escopado ao usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.alertEventService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
