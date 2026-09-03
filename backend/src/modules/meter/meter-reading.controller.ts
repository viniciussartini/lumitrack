import type { Request, Response, NextFunction } from "express"
import type { MeterReadingService } from "@/modules/meter/meter-reading.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP das leituras agregadas — delega toda a regra a {@link MeterReadingService}. */
export class MeterReadingController {
    /** @param meterReadingService - Serviço de leituras agregadas, composto manualmente nas rotas do módulo. */
    constructor(private readonly meterReadingService: MeterReadingService) {}

    /**
     * `GET /api/meter-readings?targetType=&targetId=&granularity=&from=&to=`
     * — série agregada de leituras (gráfico "ao vivo") do alvo informado,
     * escopada ao usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.meterReadingService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
