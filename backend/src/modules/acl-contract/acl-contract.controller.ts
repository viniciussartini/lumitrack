import type { Request, Response, NextFunction } from "express"
import type { AclContractService } from "@/modules/acl-contract/acl-contract.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de contratos de energia do Mercado Livre (ACL) — delega toda a regra a {@link AclContractService}. */
export class AclContractController {
    /** @param aclContractService - Serviço de CRUD de contratos ACL. */
    constructor(private readonly aclContractService: AclContractService) {}

    /**
     * `POST /api/acl-contracts` — cria um contrato para o usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const contract = await this.aclContractService.create(userId, req.body)
            res.status(201).json({ status: "success", data: contract })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/acl-contracts?page=&pageSize=&propertyId=` — lista paginada
     * dos contratos do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.aclContractService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/acl-contracts/:id` — detalhe de um contrato do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const contract = await this.aclContractService.findById(id, userId)
            res.status(200).json({ status: "success", data: contract })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/acl-contracts/:id` — atualiza um contrato do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const contract = await this.aclContractService.update(id, userId, req.body)
            res.status(200).json({ status: "success", data: contract })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/acl-contracts/:id` — remove um contrato do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.aclContractService.delete(id, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
