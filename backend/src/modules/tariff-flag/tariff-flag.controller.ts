import type { Request, Response, NextFunction } from "express"
import type { TariffFlagService } from "@/modules/tariff-flag/tariff-flag.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP da bandeira tarifária vigente — delega toda a regra a {@link TariffFlagService}. */
export class TariffFlagController {
    /** @param tariffFlagService - Serviço da bandeira tarifária, composto manualmente nas rotas do módulo. */
    constructor(private readonly tariffFlagService: TariffFlagService) {}

    /**
     * `GET /api/tariff-flag` — consulta a bandeira tarifária vigente,
     * disponível a qualquer usuário autenticado (informativo).
     *
     * @param _req - Requisição HTTP Express (não usada).
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const config = await this.tariffFlagService.get()
            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/tariff-flag` — atualiza a bandeira tarifária vigente,
     * restrito a usuários autenticados com papel ADMIN.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const actorUserId = (req as AuthenticatedRequest).user.id
            const config = await this.tariffFlagService.update(req.body, actorUserId)
            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }
}
