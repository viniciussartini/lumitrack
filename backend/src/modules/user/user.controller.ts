import type { Request, Response, NextFunction } from "express"
import type { UserService } from "@/modules/user/user.service.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

export class UserController {
    constructor(private readonly userService: UserService) {}

    // POST /api/users - Público
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = await this.userService.createUser(req.body)

            res.status(201).json({ status: "success", data: user })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/users/:id — Autenticado
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const authenticatedUser = (req as AuthenticatedRequest).user

            if (authenticatedUser.id !== id) {
                throw new ForbiddenError("Acesso negado")
            }

            const user = await this.userService.findById(id)

            res.status(200).json({ status: "success", data: user })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/users/:id — Autenticado
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const authenticatedUser = (req as AuthenticatedRequest).user

            if (authenticatedUser.id !== id) {
                throw new ForbiddenError("Acesso negado")
            }

            const user = await this.userService.updateUser(id, req.body)

            res.status(200).json({ status: "success", data: user })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/users/:id — Autenticado
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params as { id: string }
            const authenticatedUser = (req as AuthenticatedRequest).user

            if (authenticatedUser.id !== id) {
                throw new ForbiddenError("Acesso negado")
            }

            await this.userService.deleteUser(id)

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}