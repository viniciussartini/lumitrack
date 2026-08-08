import express, { type NextFunction, type Request, type Response } from "express"
import cors from "cors"
import helmet from "helmet"
import { z, ZodError } from "zod"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger.js"
import { NotFoundError, UnauthorizedError } from "@/shared/errors.js"
import { createApiRateLimiter } from "@/shared/rateLimiter.js"
import { requireApiToken } from "@/api/middlewares/apiToken.js"
import type { SimulationStore } from "@/simulation/store.js"
import type { SimulationEngine } from "@/simulation/simulationEngine.js"
import { networksRoutes } from "@/api/routes/networks.routes.js"
import { devicesRoutes } from "@/api/routes/devices.routes.js"
import { statusRoutes } from "@/api/routes/status.routes.js"

export interface AppDependencies {
    store: SimulationStore
    engine: SimulationEngine
    apiToken?: string
}

export function createApp({
    store,
    engine,
    apiToken = env.SIMULATOR_API_TOKEN,
}: AppDependencies): express.Express {
    const app = express()

    // API JSON+SSE pura — nunca serve HTML/documento sob esta origem, mesma
    // CSP restritiva do backend real (backend/src/app.ts).
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                },
            },
        }),
    )
    app.use(cors({ origin: env.CORS_ORIGIN }))
    app.use(createApiRateLimiter())
    app.use(express.json())

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" })
    })

    app.get("/api/broker/info", (_req, res) => {
        res.json({ host: "localhost", port: env.BROKER_PORT })
    })

    // Token de API só nas rotas de controle (issue #180) — /api/broker/info
    // e /api/status/stream continuam sem token: o segundo é consumido via
    // EventSource nativo do browser, que não permite headers customizados.
    const authenticate = requireApiToken(apiToken)
    app.use("/api/networks", authenticate, networksRoutes(store, engine))
    app.use("/api/devices", authenticate, devicesRoutes(store, engine))
    app.use("/api/status", statusRoutes(store))

    // Express 5 encaminha automaticamente exceções síncronas e rejeições de
    // handlers async para este middleware — não precisa de try/catch manual
    // em cada rota (schema.parse() lançando ZodError incluso).
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof ZodError) {
            res.status(422).json({
                status: "error",
                message: "Dados inválidos",
                issues: z.flattenError(err).fieldErrors,
            })
            return
        }
        if (err instanceof NotFoundError) {
            res.status(404).json({ status: "error", message: err.message })
            return
        }
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ status: "error", message: err.message })
            return
        }
        logger.error({ err }, "Erro não tratado")
        res.status(500).json({ status: "error", message: "Erro interno" })
    })

    return app
}
