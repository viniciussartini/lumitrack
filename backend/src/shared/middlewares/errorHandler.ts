import type { Request, Response, NextFunction, ErrorRequestHandler } from "express"
import { z, ZodError } from "zod"
import { AppError, ForbiddenError } from "@/shared/errors/AppError.js"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger/logger.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext, inferResource } from "@/shared/audit/requestContext.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

// Factory (mesmo padrão de `createAuthenticateMiddleware`) — precisa de
// `auditService` para registrar acessos negados (403) sem instrumentar cada
// um dos ~17 pontos do código que lançam `ForbiddenError` individualmente.
export function createErrorHandler(auditService: AuditService): ErrorRequestHandler {
    return async function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): Promise<void> {
        // Erro de validação do Zod
        // Zod lança ZodError com um array de issues detalhadas.
        if (err instanceof ZodError) {
            const flattened = z.flattenError(err)

            res.status(422).json({
                status: "error",
                message: "Dados inválidos",
                issues: flattened.fieldErrors,
            })
            return
        }

        // Erros operacionais da aplicação (AppError e subclasses)
        if (err instanceof AppError) {
            if (err instanceof ForbiddenError) {
                const { resourceType, resourceId } = inferResource(req)

                // Aguardado (não fire-and-forget): determinístico para quem
                // consulta o audit log logo após receber a resposta — o custo
                // de uma escrita extra é aceitável, 403 não é rota de alto
                // tráfego. AuditService.record já isola qualquer falha de
                // persistência (nunca rejeita).
                await auditService.record({
                    userId: (req as Partial<AuthenticatedRequest>).user?.id ?? null,
                    action: "ACCESS_DENIED",
                    outcome: "FAILURE",
                    resourceType,
                    resourceId,
                    ...getRequestContext(req),
                    metadata: { path: req.originalUrl, method: req.method, message: err.message },
                })
            }

            res.status(err.statusCode).json({
                status: "error",
                message: err.message,
            })
            return
        }

        // Erro inesperado (bug)
        // Em produção, nunca expõe detalhes internos. Em desenvolvimento, ajuda o debug.
        logger.error({ err, path: req.originalUrl, method: req.method }, "Erro inesperado")

        res.status(500).json({
            status: "error",
            message: "Erro interno do servidor",
            ...(env.NODE_ENV === "development" && {
                detail: err instanceof Error ? err.message : String(err),
            }),
        })
    }
}
