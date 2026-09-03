import type { Request, Response, NextFunction } from "express"
import type { AlertService } from "@/modules/alert/alert.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de alertas por faixa de potência — delega toda a regra a {@link AlertService}. */
export class AlertController {
    /** @param alertService - Serviço de CRUD e status de alertas. */
    constructor(private readonly alertService: AlertService) {}

    /**
     * `POST /api/alerts` — cria um alerta para o usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const alert = await this.alertService.create(userId, req.body)
            res.status(201).json({ status: "success", data: alert })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/alerts?page=&pageSize=` — lista paginada dos alertas do
     * usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.alertService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/alerts/firing` — alertas em disparo no momento, para
     * hidratação inicial do badge (o resto chega via SSE).
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findFiring(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const firing = await this.alertService.findFiring(userId)
            res.status(200).json({ status: "success", data: firing })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/alerts/stats` — KPI de contagem de alertas habilitados do
     * usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const enabledCount = await this.alertService.countEnabled(userId)
            res.status(200).json({ status: "success", data: { enabledCount } })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/alerts/:id` — detalhe de um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
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

    /**
     * `PUT /api/alerts/:id` — atualiza um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
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

    /**
     * `PATCH /api/alerts/:id/enabled` — liga/desliga um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
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

    /**
     * `DELETE /api/alerts/:id` — remove um alerta do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
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
