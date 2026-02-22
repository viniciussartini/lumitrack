import type { Request, Response, NextFunction } from "express"
import type { AuthService } from "@/modules/auth/auth.service.js"

export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // POST /api/auth/login — Público
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.authService.login(req.body)

            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/logout — Protegido
    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const token = req.headers.authorization!.split(" ")[1]!
            await this.authService.logout(token)

            res.status(200).json({ status: "success", message: "Logout realizado com sucesso" })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/forgot-password — Público
    async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await this.authService.forgotPassword(req.body)

            res.status(200).json({
                status: "success",
                message: "Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.",
            })
        } catch (error) {
            next(error)
        }
    }

    // POST /api/auth/reset-password — Público
    async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await this.authService.resetPassword(req.body)
            
            res.status(200).json({
                status: "success",
                message: "Senha redefinida com sucesso",
            })
        } catch (error) {
            next(error)
        }
    }
}