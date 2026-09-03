import type { Request, Response, NextFunction } from "express"
import type { NotificationService } from "@/modules/notification/notification.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das notificações efêmeras do usuário — delega toda a regra a {@link NotificationService}. */
export class NotificationController {
    /** @param notificationService - Serviço de notificações efêmeras, composto manualmente nas rotas do módulo. */
    constructor(private readonly notificationService: NotificationService) {}

    /**
     * `GET /api/notifications` — lista as notificações pendentes do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    findAll(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const notifications = this.notificationService.findAll(userId)
            res.status(200).json({ status: "success", data: notifications })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/notifications/:id` — remove uma notificação ("lida" = excluída).
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    delete(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            this.notificationService.delete(userId, id)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/notifications` — limpa todas as notificações do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    deleteAll(req: Request, res: Response, next: NextFunction): void {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            this.notificationService.deleteAll(userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
