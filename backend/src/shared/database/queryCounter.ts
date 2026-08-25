import { AsyncLocalStorage } from "node:async_hooks"
import type { RequestHandler } from "express"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "queryCounter" })

type QueryCounterState = { count: number }

const storage = new AsyncLocalStorage<QueryCounterState>()

/**
 * Incrementa o contador de queries da requisição em curso. Chamado pelo
 * listener `prisma.$on('query')` — não faz nada fora de uma requisição
 * rastreada por {@link createQueryCountMiddleware} (nenhum contexto ativo).
 */
export function incrementQueryCount(): void {
    const state = storage.getStore()
    if (state) {
        state.count += 1
    }
}

/**
 * Lê o contador da requisição em curso — `null` fora de um contexto
 * rastreado. Isolado por execução assíncrona (`AsyncLocalStorage`): chamado
 * de dentro do handler de uma requisição, nunca vê o contador de outra
 * requisição concorrente.
 */
export function getQueryCount(): number | null {
    return storage.getStore()?.count ?? null
}

/**
 * Cria o middleware que conta, por requisição, quantas queries Prisma foram
 * disparadas, logando o total ao final — restrito aos prefixos de caminho
 * informados (ex.: `/api/alerts`, `/api/consumption`), para não instrumentar
 * a API inteira.
 *
 * Instrumentação pura: nunca deve rodar em produção — ver
 * `DEBUG_QUERY_LOGGING_ENABLED` em `config/env.ts`, que falha fechado nesse
 * ambiente. Só tem efeito quando `prisma.$on('query')` está de fato
 * incrementando o contador (`shared/database/prisma.ts`).
 *
 * @param trackedPathPrefixes - Prefixos de `req.path` a instrumentar.
 */
export function createQueryCountMiddleware(trackedPathPrefixes: readonly string[]): RequestHandler {
    return (req, res, next) => {
        if (!trackedPathPrefixes.some((prefix) => req.path.startsWith(prefix))) {
            next()
            return
        }

        storage.run({ count: 0 }, () => {
            res.on("finish", () => {
                log.info(
                    { path: req.path, method: req.method, queryCount: getQueryCount() ?? 0 },
                    "Contagem de queries Prisma da requisição",
                )
            })
            next()
        })
    }
}
