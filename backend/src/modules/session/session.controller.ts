import type { Request, Response, NextFunction } from "express"
import type { SessionService } from "@/modules/session/session.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das sessões ativas — delega a regra a {@link SessionService}. */
export class SessionController {
    /** @param service - Serviço da lista de sessões. */
    constructor(private readonly service: SessionService) {}

    /**
     * `GET /api/sessions` — sessões ativas do usuário autenticado. O dono vem
     * sempre do token, nunca de parâmetro da requisição.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId, sessionId, isDemo } = (req as AuthenticatedRequest).user
            const items = await this.service.list({ userId, sessionId, isDemo })
            res.status(200).json({ status: "success", data: { items } })
        } catch (error) {
            next(error)
        }
    }
}
