import type { Request, Response, NextFunction } from "express"
import type { UserService } from "@/modules/user/user.service.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"

export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly auditService: AuditService,
    ) {}

    // POST /api/users - Público
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = await this.userService.createUser(req.body)

            await this.auditService.record({
                userId: user.id,
                action: "USER_CREATE",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: user.id,
                ...getRequestContext(req),
            })

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

            // Registra QUAIS campos mudaram, nunca os valores — o audit log
            // não deve se tornar, ele mesmo, um repositório de dados pessoais.
            await this.auditService.record({
                userId: authenticatedUser.id,
                action: "USER_UPDATE",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: id,
                metadata: { fields: Object.keys(req.body as object) },
                ...getRequestContext(req),
            })

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

            // userId aqui ficaria nulo de qualquer forma após a exclusão
            // (FK com onDelete: SetNull) — registrado explicitamente como
            // null por clareza, já que o usuário não existe mais.
            await this.auditService.record({
                userId: null,
                action: "USER_DELETE",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: id,
                ...getRequestContext(req),
            })

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
