import type { Request, Response, NextFunction } from "express"
import type { DemandOverviewService } from "@/modules/demand/demand.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP da visão de demanda — delega toda a regra a {@link DemandOverviewService}. */
export class DemandController {
    /** @param service - Serviço da visão de demanda. */
    constructor(private readonly service: DemandOverviewService) {}

    /**
     * `GET /api/demand/overview?propertyId=` — demanda atual, máxima do mês,
     * ultrapassagem e curva do dia de uma propriedade do Grupo A.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.service.overview(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
