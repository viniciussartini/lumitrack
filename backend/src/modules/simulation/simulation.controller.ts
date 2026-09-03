import type { Request, Response, NextFunction } from "express"
import type { SimulationService } from "@/modules/simulation/simulation.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP da simulação de consumo/custo — delega toda a regra a {@link SimulationService}. */
export class SimulationController {
    /** @param simulationService - Serviço de simulação, composto manualmente nas rotas do módulo. */
    constructor(private readonly simulationService: SimulationService) {}

    /**
     * `POST /api/properties/:propertyId/simulation` — simula consumo e custo
     * para o alvo informado no body (PROPERTY, AREA ou DEVICE — o alvo é
     * definido pelo body, não pela URL).
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const result = await this.simulationService.simulate(propertyId, userId, req.body)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
