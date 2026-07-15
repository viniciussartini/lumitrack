import express, { type NextFunction, type Request, type Response } from "express"
import cors from "cors"
import { z, ZodError } from "zod"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger.js"
import { NotFoundError } from "@/shared/errors.js"
import type { SimulationStore } from "@/simulation/store.js"
import type { SimulationEngine } from "@/simulation/simulationEngine.js"
import { networksRoutes } from "@/api/routes/networks.routes.js"
import { devicesRoutes } from "@/api/routes/devices.routes.js"
import { statusRoutes } from "@/api/routes/status.routes.js"

export interface AppDependencies {
    store: SimulationStore
    engine: SimulationEngine
}

export function createApp({ store, engine }: AppDependencies): express.Express {
    const app = express()
    app.use(cors({ origin: env.CORS_ORIGIN }))
    app.use(express.json())

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" })
    })

    app.get("/api/broker/info", (_req, res) => {
        res.json({ host: "localhost", port: env.BROKER_PORT })
    })

    app.use("/api/networks", networksRoutes(store, engine))
    app.use("/api/devices", devicesRoutes(store, engine))
    app.use("/api/status", statusRoutes(store))

    // Express 5 encaminha automaticamente exceções síncronas e rejeições de
    // handlers async para este middleware — não precisa de try/catch manual
    // em cada rota (schema.parse() lançando ZodError incluso).
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof ZodError) {
            res.status(422).json({ status: "error", message: "Dados inválidos", issues: z.flattenError(err).fieldErrors })
            return
        }
        if (err instanceof NotFoundError) {
            res.status(404).json({ status: "error", message: err.message })
            return
        }
        logger.error({ err }, "Erro não tratado")
        res.status(500).json({ status: "error", message: "Erro interno" })
    })

    return app
}
