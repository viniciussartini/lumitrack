import type { Request, Response, NextFunction, ErrorRequestHandler } from "express"
import { z, ZodError } from "zod"
import { AppError, ForbiddenError } from "@/shared/errors/AppError.js"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger/logger.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext, inferResource } from "@/shared/audit/requestContext.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

const CLIENT_ERROR_MIN = 400
const CLIENT_ERROR_MAX = 499

// Mensagem genérica por status. O texto do erro original não é devolvido: o do
// `entity.parse.failed`, por exemplo, ecoa um trecho do JSON recebido.
const CLIENT_ERROR_MESSAGES: Readonly<Record<number, string>> = {
    413: "Corpo da requisição grande demais",
    415: "Tipo de conteúdo não suportado",
}
const DEFAULT_CLIENT_ERROR_MESSAGE = "Corpo da requisição inválido"

// Erro de cliente que o body-parser (`express.json`/`urlencoded`) e o resto da
// cadeia lançam via http-errors: JSON inválido, corpo acima do limite, charset
// ou encoding não suportado. Trazem `status` 4xx e `expose: true`. Os `entity.*`
// anexam o corpo recebido em `err.body`, que pode conter senha, e todos são
// provocáveis à vontade pelo cliente; por isso não viram 500 nem entram no log.
function isClientRequestError(err: unknown): err is Error & { status: number } {
    return (
        err instanceof Error &&
        "status" in err &&
        typeof err.status === "number" &&
        err.status >= CLIENT_ERROR_MIN &&
        err.status <= CLIENT_ERROR_MAX &&
        "expose" in err &&
        err.expose === true
    )
}

type ErrorLogger = Pick<typeof logger, "error">

// Factory (mesmo padrão de `createAuthenticateMiddleware`) — precisa de
// `auditService` para registrar acessos negados (403) sem instrumentar cada
// um dos ~17 pontos do código que lançam `ForbiddenError` individualmente.
// `log` é o logger da aplicação, para o erro inesperado sair pelo mesmo destino
// do log de requisição.
export function createErrorHandler(
    auditService: AuditService,
    log: ErrorLogger = logger,
): ErrorRequestHandler {
    return async function errorHandler(
        err: unknown,
        req: Request,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
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

        if (isClientRequestError(err)) {
            res.status(err.status).json({
                status: "error",
                message: CLIENT_ERROR_MESSAGES[err.status] ?? DEFAULT_CLIENT_ERROR_MESSAGE,
            })
            return
        }

        // Erro inesperado (bug)
        // Em produção, nunca expõe detalhes internos. Em desenvolvimento, ajuda o debug.
        log.error({ err, path: req.originalUrl, method: req.method }, "Erro inesperado")

        res.status(500).json({
            status: "error",
            message: "Erro interno do servidor",
            ...(env.NODE_ENV === "development" && {
                detail: err instanceof Error ? err.message : String(err),
            }),
        })
    }
}
