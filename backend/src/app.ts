import express from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "@/config/env.js"
import { errorHandler } from "@/shared/middlewares/errorHandler.js"
import { userRoutes } from "./modules/user/user.routes.js"

export function createApp() {
    const app = express()

    // Segurança
    // helmet define cabeçalhos HTTP que protegem contra ataques comuns
    // (clickjacking, XSS, sniffing de tipo MIME, etc.)
    app.use(helmet())

    // cors define quais origens podem fazer requisições para a API
    app.use(cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    }))

    // Parsing
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    // Health check
    // Endpoint simples para verificar se a API está no ar.
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() })
    })

    // Rotas dos módulos
    app.use("/api/users", userRoutes)

    // Middleware de erros
    app.use(errorHandler)

    return app
}