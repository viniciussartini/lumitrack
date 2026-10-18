import type { Request, Response, NextFunction } from "express"
import type { PropertyComparisonService } from "@/modules/consumption/comparison/property-comparison.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das comparações de propriedade — delega toda a regra a {@link PropertyComparisonService}. */
export class PropertyComparisonController {
    /** @param propertyComparisonService - Serviço das comparações, composto manualmente nas rotas do módulo. */
    constructor(private readonly propertyComparisonService: PropertyComparisonService) {}

    /**
     * `GET /api/consumption/acl-comparison?propertyId=&from=&to=` —
     * comparação ACR × ACL a partir do consumo real de uma propriedade.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async compareAclToAcr(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.propertyComparisonService.compareAclToAcr(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/consumption/branca-comparison?propertyId=&from=&to=` —
     * comparação Convencional × Branca a partir do consumo real de uma
     * propriedade.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async compareBrancaToConvencional(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.propertyComparisonService.compareBrancaToConvencional(
                userId,
                req.query,
            )
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
