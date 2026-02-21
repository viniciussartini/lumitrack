import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { env } from "@/config/env.js"
import { UnauthorizedError } from "@/shared/errors/AppError.js"

// Extendemos o tipo Request do Express para incluir o usuário autenticado.
// Isso evita usar `any` e mantém a tipagem segura em todos os controllers.
export interface AuthenticatedRequest extends Request {
    user: {
        id: string
        email: string
        userType: string
    }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith("Bearer ")) {
        throw new UnauthorizedError("Token não fornecido")
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
        throw new UnauthorizedError("Token malformado")
    }

    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthenticatedRequest["user"]
        ;(req as AuthenticatedRequest).user = payload
        next()
    } catch {
        throw new UnauthorizedError("Token inválido ou expirado")
    }
}