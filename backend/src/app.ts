import express from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "@/config/env.js"
import { errorHandler } from "@/shared/middlewares/errorHandler.js"
import { createAuthenticateMiddleware } from "@/shared/middlewares/authenticate.js"
import { PrismaClient } from "@/generated/prisma/client.js"
import { prisma } from "@/shared/database/prisma.js"
import type { SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import { sendPasswordResetEmail as realSendPasswordResetEmail } from "@/modules/auth/email.service.js"
import { userRoutes } from "@/modules/user/user.routes.js"
import { authRoutes } from "@/modules/auth/auth.routes.js"
import { distributorRoutes } from "./modules/distributor/distributor.routes.js"
import { propertyRoutes } from "./modules/property/property.routes.js"

export interface AppDependencies {
    prismaClient?: PrismaClient
    sendPasswordResetEmail?: SendPasswordResetEmailFn
}

export function createApp(deps: AppDependencies = {}) {
    const prismaClient = deps.prismaClient ?? prisma
    const sendPasswordResetEmail = deps.sendPasswordResetEmail ?? realSendPasswordResetEmail

    const app = express()

    app.use(helmet())
    app.use(cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    }))

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    app.get("/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() })
    })

    const authenticate = createAuthenticateMiddleware(prismaClient)

    app.use("/api/users", userRoutes(authenticate))
    app.use("/api/auth", authRoutes(authenticate, prismaClient, sendPasswordResetEmail))
    app.use("/api/distributors", distributorRoutes(authenticate, prismaClient))
    app.use("/api/properties", propertyRoutes(authenticate, prismaClient))

    app.use(errorHandler)

    return app
}