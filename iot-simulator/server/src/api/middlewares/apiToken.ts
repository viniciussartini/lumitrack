import { timingSafeEqual } from "crypto"
import type { NextFunction, Request, Response } from "express"
import { UnauthorizedError } from "@/shared/errors.js"

const BEARER_PREFIX = "Bearer "

// Compara o token recebido com o esperado em tempo constante — mesmo padrão
// de backend/src/shared/security/csrf.ts. Checa o tamanho antes porque
// timingSafeEqual lança se os buffers tiverem tamanhos diferentes.
function tokensMatch(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(expected)

    if (providedBuffer.length !== expectedBuffer.length) {
        return false
    }

    return timingSafeEqual(providedBuffer, expectedBuffer)
}

// Protege as rotas de controle do simulador (/api/networks, /api/devices)
// com um token estático via `Authorization: Bearer <token>` — mesma
// convenção do backend real, sem sessão/JWT (ferramenta de dev local com um
// único operador confiável).
export function requireApiToken(expectedToken: string) {
    return function apiToken(req: Request, _res: Response, next: NextFunction): void {
        const header = req.headers.authorization
        const provided = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : ""

        if (!provided || !tokensMatch(provided, expectedToken)) {
            next(new UnauthorizedError("Token de API ausente ou inválido"))
            return
        }

        next()
    }
}
