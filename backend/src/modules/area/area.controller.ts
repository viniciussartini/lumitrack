import type { Request, Response, NextFunction } from "express"
import type { AreaService } from "@/modules/area/area.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de áreas de uma propriedade — delega toda a regra a {@link AreaService}. */
export class AreaController {
    /** @param areaService - Serviço de CRUD de áreas. */
    constructor(private readonly areaService: AreaService) {}

    /**
     * `POST /api/properties/:propertyId/areas` — cria uma área na
     * propriedade do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.create(propertyId, userId, req.body)
            res.status(201).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/properties/:propertyId/areas?page=&pageSize=` — lista
     * paginada das áreas da propriedade do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId } = req.params as { propertyId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const result = await this.areaService.findAll(propertyId, userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/properties/:propertyId/areas/:areaId` — detalhe de uma
     * área do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.findById(areaId, propertyId, userId)
            res.status(200).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/properties/:propertyId/areas/:areaId` — atualiza uma área
     * do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const area = await this.areaService.update(areaId, propertyId, userId, req.body)
            res.status(200).json({ status: "success", data: area })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/properties/:propertyId/areas/:areaId` — remove uma área
     * do titular.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.areaService.delete(areaId, propertyId, userId)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
