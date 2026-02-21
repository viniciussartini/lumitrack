import type { Request, Response, NextFunction } from "express"
import { z, ZodError } from "zod"
import { AppError } from "@/shared/errors/AppError.js"
import { env } from "@/config/env.js"

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    // Erro de validação do Zod
    // Zod lança ZodError com um array de issues detalhadas.
    if (err instanceof ZodError) {

        const flattened = z.flattenError(err);

        res.status(422).json({
            status: "error",
            message: "Dados inválidos",
            issues: flattened.fieldErrors,
        })
        return
    }

    // Erros operacionais da aplicação (AppError e subclasses)
    if (err instanceof AppError) {
            res.status(err.statusCode).json({
            status: "error",
            message: err.message,
        })
        return
    }

    // Erro inesperado (bug)
    // Em produção, nunca expõe detalhes internos. Em desenvolvimento, ajuda o debug.
    console.error("Erro inesperado:", err)

    res.status(500).json({
        status: "error",
        message: "Erro interno do servidor",
        ...(env.NODE_ENV === "development" && {
            detail: err instanceof Error ? err.message : String(err),
        }),
    })
}