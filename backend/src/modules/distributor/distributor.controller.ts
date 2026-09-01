import type { Request, Response, NextFunction } from "express"
import type { DistributorService } from "@/modules/distributor/distributor.service.js"

/** Camada HTTP do catálogo de distribuidoras — delega toda a regra a {@link DistributorService}. */
export class DistributorController {
    /** @param distributorService - Serviço do catálogo de distribuidoras, composto manualmente nas rotas do módulo. */
    constructor(private readonly distributorService: DistributorService) {}

    /**
     * `GET /api/distributors?page=&pageSize=` — lista paginada do catálogo
     * global de distribuidoras, disponível a qualquer usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.distributorService.findAll(req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/distributors/:id` — detalhe de uma distribuidora do catálogo.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: distributorId } = req.params as { id: string }

            const distributor = await this.distributorService.findById(distributorId)

            res.status(200).json({ status: "success", data: distributor })
        } catch (error) {
            next(error)
        }
    }
}
