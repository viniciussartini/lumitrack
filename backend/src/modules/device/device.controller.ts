import type { Request, Response, NextFunction } from "express"
import type { DeviceService } from "@/modules/device/device.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

/** Camada HTTP de dispositivos — delega toda a regra a {@link DeviceService}. */
export class DeviceController {
    /** @param deviceService - Serviço de dispositivos, composto manualmente nas rotas do módulo. */
    constructor(private readonly deviceService: DeviceService) {}

    /**
     * `POST /api/properties/:propertyId/areas/:areaId/devices` — cria um
     * dispositivo na área informada, após validar a posse da propriedade/área.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.create(areaId, propertyId, userId, req.body)

            res.status(201).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/properties/:propertyId/areas/:areaId/devices?page=&pageSize=` —
     * lista paginada dos dispositivos da área, escopada ao usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId } = req.params as { propertyId: string; areaId: string }
            const { id: userId } = (req as AuthenticatedRequest).user

            const result = await this.deviceService.findAll(areaId, propertyId, userId, req.query)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/properties/:propertyId/areas/:areaId/devices/:id` — detalhe
     * de um dispositivo, após validar a cadeia de posse (propriedade → área → device).
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.findById(id, areaId, propertyId, userId)

            res.status(200).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/properties/:propertyId/areas/:areaId/devices/:id` — atualiza
     * um dispositivo já existente, após revalidar a cadeia de posse.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const device = await this.deviceService.update(id, areaId, propertyId, userId, req.body)

            res.status(200).json({ status: "success", data: device })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/properties/:propertyId/areas/:areaId/devices/:id` —
     * remove um dispositivo, após revalidar a cadeia de posse.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, id } = req.params as {
                propertyId: string
                areaId: string
                id: string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.deviceService.delete(id, areaId, propertyId, userId)

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
