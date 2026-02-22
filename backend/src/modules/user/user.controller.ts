import type { Request, Response, NextFunction } from "express"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prisma } from "@/shared/database/prisma.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

const userRepository = new UserRepository(prisma)
const userService = new UserService(userRepository)

export class UserController {
    // POST /api/users - Público
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = await userService.createUser(req.body)

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

            const user = await userService.findById(id)

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

            const user = await userService.updateUser(id, req.body)

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

            await userService.deleteUser(id)

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}