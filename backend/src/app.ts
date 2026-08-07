import express, { type RequestHandler } from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { pinoHttp } from "pino-http"
import type { Logger } from "pino"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger/logger.js"
import { createErrorHandler } from "@/shared/middlewares/errorHandler.js"
import { createAuthenticateMiddleware } from "@/shared/middlewares/authenticate.js"
import { createGlobalRateLimiter, createAuthRateLimiter } from "@/shared/middlewares/rateLimiter.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { AuditService } from "@/shared/audit/audit.service.js"
import { PrismaClient } from "@/generated/prisma/client.js"
import { prisma } from "@/shared/database/prisma.js"
import type { SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import { sendPasswordResetEmail as realSendPasswordResetEmail } from "@/modules/auth/email.service.js"
import { userRoutes } from "@/modules/user/user.routes.js"
import { exportRoutes } from "@/modules/export/export.routes.js"
import { adminRoutes } from "@/modules/admin/admin.routes.js"
import { authRoutes } from "@/modules/auth/auth.routes.js"
import { distributorRoutes } from "./modules/distributor/distributor.routes.js"
import { tariffFlagRoutes } from "./modules/tariff-flag/tariff-flag.routes.js"
import { propertyRoutes } from "./modules/property/property.routes.js"
import { alertRoutes } from "./modules/alert/alert.routes.js"
import { alertEventRoutes } from "./modules/alert-event/alert-event.routes.js"
import { notificationRoutes } from "./modules/notification/notification.routes.js"
import { meterRoutes } from "./modules/meter/meter.routes.js"
import { consumptionRoutes } from "./modules/consumption/consumption.routes.js"
import { IoTDataProcessor } from "./modules/iot/iot-worker/IoTDataProcessor.js"
import { iotStreamRoutes } from "./modules/iot/iot-stream.routes.js"
import type { AlertEvaluator } from "./modules/alert/alert-evaluator.js"
import { UserEventHub } from "./shared/sse/user-event-hub.js"
import { NotificationStore } from "./shared/notifications/notification-store.js"

export interface AppDependencies {
    prismaClient?: PrismaClient
    sendPasswordResetEmail?: SendPasswordResetEmailFn
    processor?: IoTDataProcessor
    userEventHub?: UserEventHub
    alertEvaluator?: AlertEvaluator
    notificationStore?: NotificationStore
    globalRateLimiter?: RequestHandler
    authRateLimiter?: RequestHandler
    // Injeção só usada em teste — permite capturar o stream do pino com
    // `level` habilitado (o logger singleton fica "silent" em NODE_ENV=test)
    // para asserção de não-vazamento de dado sensível (RNF05).
    logger?: Logger
}

export function createApp(deps: AppDependencies = {}) {
    const prismaClient = deps.prismaClient ?? prisma
    const sendPasswordResetEmail = deps.sendPasswordResetEmail ?? realSendPasswordResetEmail
    const processor = deps.processor
    const userEventHub = deps.userEventHub
    const alertEvaluator = deps.alertEvaluator
    const notificationStore = deps.notificationStore ?? new NotificationStore()
    const globalRateLimiter = deps.globalRateLimiter ?? createGlobalRateLimiter()
    const authRateLimiter = deps.authRateLimiter ?? createAuthRateLimiter()
    const appLogger = deps.logger ?? logger

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

    app.use(
        helmet({
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
        }),
    )
    app.use(
        cors({
            origin: env.CORS_ORIGIN,
            credentials: true,
        }),
    )

    // Health check fica fora do rate limit (monitoramento / load balancer).
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() })
    })

    // Necessário para o canal WEB ler o cookie de sessão/CSRF em `authenticate`.
    app.use(cookieParser())

    // Log estruturado de requisição/resposta (A09). `/health` é
    // ignorado porque é pollado com frequência por load balancer/monitoramento
    // e só geraria ruído.
    app.use(
        pinoHttp({
            logger: appLogger,
            autoLogging: { ignore: (req) => req.url === "/health" },
            customLogLevel(_req, res, err) {
                if (err || res.statusCode >= 500) return "error"
                if (res.statusCode >= 400) return "warn"
                return "info"
            },
        }),
    )

    // Rede de segurança global por IP para toda a API.
    app.use(globalRateLimiter)

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const authenticate = createAuthenticateMiddleware(prismaClient)
    const auditService = new AuditService(new AuditRepository(prismaClient))

    // Rate limit estrito nos endpoints públicos de autenticação (brute force).
    // Aplicado após o parser de JSON para que a chave possa considerar o e-mail.
    // `app.use("/api/auth/login", ...)` é um mount point — por semântica de
    // prefixo do Express, isso já cobre `/api/auth/login/mfa` também,
    // que é exatamente o alvo de brute force de um código TOTP de 6 dígitos
    // (baixa entropia, precisa do mesmo limiter estrito que a senha).
    app.use("/api/auth/login", authRateLimiter)
    app.use("/api/auth/forgot-password", authRateLimiter)
    app.use("/api/auth/reset-password", authRateLimiter)

    app.use("/api/users", exportRoutes(authenticate, prismaClient, auditService))
    app.use("/api/users", userRoutes(authenticate, prismaClient, auditService))
    app.use("/api/admin", adminRoutes(authenticate, prismaClient, auditService))
    app.use(
        "/api/auth",
        authRoutes(authenticate, prismaClient, sendPasswordResetEmail, auditService),
    )
    app.use("/api/distributors", distributorRoutes(authenticate, prismaClient))
    app.use("/api/tariff-flag", tariffFlagRoutes(authenticate, prismaClient))
    app.use("/api/properties", propertyRoutes(authenticate, prismaClient, auditService))
    app.use("/api/alerts", alertRoutes(authenticate, prismaClient, alertEvaluator))
    app.use("/api/alert-events", alertEventRoutes(authenticate, prismaClient))
    app.use("/api/notifications", notificationRoutes(authenticate, notificationStore))
    app.use("/api/meters", meterRoutes(authenticate, prismaClient))
    app.use("/api/consumption", consumptionRoutes(authenticate, prismaClient))

    if (processor && userEventHub) {
        app.use("/api/iot", iotStreamRoutes(authenticate, prismaClient, processor, userEventHub))
    }

    app.use(createErrorHandler(auditService))

    return app
}
