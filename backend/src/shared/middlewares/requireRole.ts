import type { RequestHandler } from "express"
import { Role } from "@/generated/prisma/client.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

// RBAC mínimo (#16 — A01/Art. 48). Deve rodar sempre depois de `authenticate`
// na cadeia de rota — depende de `req.user.role`, já lido do banco por
// `authenticate` a cada requisição (nunca um claim do JWT).
//
// `ForbiddenError` é capturado centralmente pelo errorHandler, que já audita
// automaticamente como ACCESS_DENIED — nenhum código de auditoria extra é
// necessário aqui.
export function requireRole(...allowed: Role[]): RequestHandler {
    return (req, _res, next) => {
        const { role } = (req as AuthenticatedRequest).user

        if (!allowed.includes(role)) {
            next(new ForbiddenError("Acesso restrito a administradores"))
            return
        }

        next()
    }
}
