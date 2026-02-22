import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AuthController } from "@/modules/auth/auth.controller.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuthService, type SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"

export function authRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    sendPasswordResetEmail: SendPasswordResetEmailFn,
): Router {
    const router = Router()
    const authRepository = new AuthRepository(prismaClient)
    const authService = new AuthService(authRepository, sendPasswordResetEmail)
    const authController = new AuthController(authService)

    // Rotas públicas
    router.post("/login", (req, res, next) => authController.login(req, res, next))
    router.post("/forgot-password", (req, res, next) => authController.forgotPassword(req, res, next))
    router.post("/reset-password", (req, res, next) => authController.resetPassword(req, res, next))

    // Rota protegida — exige autenticação
    router.post("/logout", authenticate, (req, res, next) => authController.logout(req, res, next))

    return router
}