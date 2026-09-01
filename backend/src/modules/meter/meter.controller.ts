import type { Request, Response, NextFunction } from "express"
import type { MeterService } from "@/modules/meter/meter.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { MeterConnectionConfig } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

// Dispara ações no IoTConnectionManager fora do ciclo request/response —
// uma falha de conexão IoT não deve impedir a resposta HTTP. Import
// dinâmico para não acoplar o módulo de negócio ao worker no nível de
// módulo (mesmo padrão usado pelo antigo iot.controller.ts). O callback
// pode ser async (buscar a config de conexão decifrada é uma chamada a
// mais ao banco) sem que este helper precise aguardá-lo: o `.then(fn)`
// externo já não é esperado por ninguém, preservando o fire-and-forget.
function withConnectionManager(
    fn: (manager: {
        start: (config: MeterConnectionConfig) => Promise<void>
        restart: (config: MeterConnectionConfig) => Promise<void>
        stop: (meterId: string) => Promise<void>
    }) => void | Promise<void>,
): void {
    void import("@/modules/iot/iot-worker/IoTConnectionManager.js").then(
        ({ IoTConnectionManager }) => {
            void fn(IoTConnectionManager.getInstance())
        },
    )
}

/**
 * Camada HTTP de medidores — delega toda a regra a {@link MeterService} e,
 * após criar/atualizar/remover, dispara em segundo plano a atualização da
 * conexão IoT real (ver `withConnectionManager`), sem bloquear a resposta.
 */
export class MeterController {
    /** @param meterService - Serviço de medidores, composto manualmente nas rotas do módulo. */
    constructor(private readonly meterService: MeterService) {}

    /**
     * `POST /api/meters` — cria o medidor e, em segundo plano, inicia a
     * conexão IoT real com a configuração recém-criada.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const meter = await this.meterService.create(userId, req.body)

            withConnectionManager(async (manager) => {
                const config = await this.meterService.getConnectionConfig(meter.id)
                if (config) await manager.start(config)
            })

            res.status(201).json({ status: "success", data: meter })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/meters?page=&pageSize=` — lista paginada dos medidores do
     * usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.meterService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/meters/by-target?targetType=&targetId=` — medidor vinculado
     * a um alvo específico (property/area/device) do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findByTarget(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const meter = await this.meterService.findByTargetQuery(userId, req.query)
            res.status(200).json({ status: "success", data: meter })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/meters/:id` — detalhe de um medidor do usuário autenticado.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const meter = await this.meterService.findById(id, userId)
            res.status(200).json({ status: "success", data: meter })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `PUT /api/meters/:id` — atualiza o medidor e, em segundo plano,
     * reinicia a conexão IoT com a configuração atualizada.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const meter = await this.meterService.update(id, userId, req.body)

            // Reinicia a conexão com os dados atualizados — se o protocolo ou
            // os parâmetros mudaram, a conexão antiga precisa cair e uma nova
            // subir com a config nova.
            withConnectionManager(async (manager) => {
                const config = await this.meterService.getConnectionConfig(meter.id)
                if (config) await manager.restart(config)
            })

            res.status(200).json({ status: "success", data: meter })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/meters/:id` — remove o medidor e, em segundo plano,
     * encerra a conexão IoT associada.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.meterService.delete(id, userId)

            withConnectionManager((manager) => {
                void manager.stop(id)
            })

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
