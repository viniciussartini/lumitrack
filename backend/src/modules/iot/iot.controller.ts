import type { Request, Response, NextFunction } from "express"
import type { IoTService } from "@/modules/iot/iot.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class IoTController {
    constructor(private readonly iotService: IoTService) {}

    // POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId:     string
                deviceId:   string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const config = await this.iotService.create(deviceId, areaId, propertyId, userId, req.body)

            // inicia a conexão em background após criar a config.
            // Não aguardamos a Promise — uma falha de conexão IoT não deve impedir
            // a resposta HTTP 201. O manager loga internamente se algo der errado.
            void import("@/modules/iot/iot-worker/IoTConnectionManager.js").then(({ IoTConnectionManager }) => {
                void IoTConnectionManager.getInstance().start(config)
            })

            res.status(201).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config
    async findByDeviceId(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId:     string
                deviceId:   string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const config = await this.iotService.findByDeviceId(deviceId, areaId, propertyId, userId)

            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId:     string
                deviceId:   string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            const config = await this.iotService.update(deviceId, areaId, propertyId, userId, req.body)

            // Reinicia a conexão com os dados atualizados (fire-and-forget).
            // Se o protocolo mudou de MQTT para RS485, por exemplo, a conexão
            // antiga precisa ser encerrada e uma nova aberta com os novos parâmetros.
            void import("@/modules/iot/iot-worker/IoTConnectionManager.js").then(({ IoTConnectionManager }) => {
                void IoTConnectionManager.getInstance().restart(config)
            })

            res.status(200).json({ status: "success", data: config })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { propertyId, areaId, deviceId } = req.params as {
                propertyId: string
                areaId:     string
                deviceId:   string
            }
            const { id: userId } = (req as AuthenticatedRequest).user

            await this.iotService.delete(deviceId, areaId, propertyId, userId)

            // Para a conexão com o dispositivo (fire-and-forget).
            void import("@/modules/iot/iot-worker/IoTConnectionManager.js").then(({ IoTConnectionManager }) => {
                void IoTConnectionManager.getInstance().stop(deviceId)
            })

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}