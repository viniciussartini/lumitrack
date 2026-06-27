import express, { type RequestHandler } from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "@/config/env.js"
import { errorHandler } from "@/shared/middlewares/errorHandler.js"
import { createAuthenticateMiddleware } from "@/shared/middlewares/authenticate.js"
import { createGlobalRateLimiter, createAuthRateLimiter } from "@/shared/middlewares/rateLimiter.js"
import { PrismaClient } from "@/generated/prisma/client.js"
import { prisma } from "@/shared/database/prisma.js"
import type { SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import { sendPasswordResetEmail as realSendPasswordResetEmail } from "@/modules/auth/email.service.js"
import { userRoutes } from "@/modules/user/user.routes.js"
import { authRoutes } from "@/modules/auth/auth.routes.js"
import { distributorRoutes } from "./modules/distributor/distributor.routes.js"
import { propertyRoutes } from "./modules/property/property.routes.js"
import { alertRoutes } from "./modules/alert/alert.routes.js"
import { IoTDataProcessor } from "./modules/iot/iot-worker/IoTDataProcessor.js"
import { iotStreamRoutes } from "./modules/iot/iot-stream.routes.js"
import { AlertNotifier } from "./modules/alert/alert-notifier.js"

export interface AppDependencies {
    prismaClient?: PrismaClient
    sendPasswordResetEmail?: SendPasswordResetEmailFn
    processor?: IoTDataProcessor
    alertNotifier?: AlertNotifier
    globalRateLimiter?: RequestHandler
    authRateLimiter?: RequestHandler
}

export function createApp(deps: AppDependencies = {}) {
    const prismaClient = deps.prismaClient ?? prisma
    const sendPasswordResetEmail = deps.sendPasswordResetEmail ?? realSendPasswordResetEmail
    const processor = deps.processor
    const alertNotifier = deps.alertNotifier
    const globalRateLimiter = deps.globalRateLimiter ?? createGlobalRateLimiter()
    const authRateLimiter = deps.authRateLimiter ?? createAuthRateLimiter()

    const app = express()

    if (env.NODE_ENV === "production") {
        // Confia em 1 hop de proxy reverso (nginx/ALB/etc. na frente da app).
        // Necessário para req.secure e req.ip refletirem o cliente real
        // (X-Forwarded-Proto/X-Forwarded-For) em vez do proxy — sem isso, o
        // rate limiter por IP trataria todos os clientes como um único IP.
        app.set("trust proxy", 1)

        // Redireciona HTTP → HTTPS antes de qualquer outro middleware.
        app.use((req, res, next) => {
            if (!req.secure) {
                res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
                return
            }
            next()
        })
    }

    app.use(helmet({
        // CSP padrão do Helmet é pensado para apps que servem HTML/JS/CSS.
        // Este backend é uma API JSON pura (+ SSE) — nada deve ser carregado
        // como documento sob esta origem, então negamos tudo explicitamente.
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
            },
        },
        // HSTS explícito (1 ano, incluindo subdomínios) — força HTTPS em
        // navegadores que já visitaram a API ao menos uma vez por HTTPS.
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    }))
    app.use(cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    }))

    // Health check fica fora do rate limit (monitoramento / load balancer).
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() })
    })

    // Rede de segurança global por IP para toda a API.
    app.use(globalRateLimiter)

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const authenticate = createAuthenticateMiddleware(prismaClient)

    // Rate limit estrito nos endpoints públicos de autenticação (brute force).
    // Aplicado após o parser de JSON para que a chave possa considerar o e-mail.
    app.use("/api/auth/login", authRateLimiter)
    app.use("/api/auth/forgot-password", authRateLimiter)
    app.use("/api/auth/reset-password", authRateLimiter)

    app.use("/api/users", userRoutes(authenticate, prismaClient))
    app.use("/api/auth", authRoutes(authenticate, prismaClient, sendPasswordResetEmail))
    app.use("/api/distributors", distributorRoutes(authenticate, prismaClient))
    app.use("/api/properties", propertyRoutes(authenticate, prismaClient, alertNotifier ?? new AlertNotifier()))
    app.use("/api/alerts", alertRoutes(authenticate, prismaClient, alertNotifier ?? new AlertNotifier()))

    if (processor && alertNotifier) {
        app.use("/api/iot", iotStreamRoutes(authenticate, prismaClient, processor, alertNotifier))
    }

    app.use(errorHandler)

    return app
}