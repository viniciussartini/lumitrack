import type { Request, Response, NextFunction } from "express"
import type { PldQuoteService } from "@/modules/pld-quote/pld-quote.service.js"

/** Camada HTTP do catálogo de PLD — delega toda a regra a {@link PldQuoteService}. */
export class PldQuoteController {
    /** @param pldQuoteService - Serviço do catálogo de PLD, composto manualmente nas rotas do módulo. */
    constructor(private readonly pldQuoteService: PldQuoteService) {}

    /**
     * `GET /api/pld-quotes?submarket=&from=&to=&page=&pageSize=` — lista
     * paginada do catálogo global de PLD, disponível a qualquer usuário
     * autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.pldQuoteService.findAll(req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }
}
