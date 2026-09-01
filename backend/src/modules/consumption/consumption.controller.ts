import type { Request, Response, NextFunction } from "express"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de consumo agregado — delega toda a regra a {@link ConsumptionService}. */
export class ConsumptionController {
    /** @param consumptionService - Serviço de consumo agregado, composto manualmente nas rotas do módulo. */
    constructor(private readonly consumptionService: ConsumptionService) {}

    /**
     * `GET /api/consumption?targetType=&targetId=&granularity=&from=&to=&page=&pageSize=` —
     * consumo agregado e paginado de um alvo, escopado ao usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.consumptionService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/consumption/summary?targetType=&ids=&granularity=&from=&to=` —
     * bucket mais recente de vários alvos do mesmo tipo, numa única chamada.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.consumptionService.summary(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
