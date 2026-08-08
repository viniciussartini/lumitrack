import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit"
import { env } from "@/config/env.js"

// Ferramenta de dev local com um único operador — janela/limite fixos, sem
// necessidade da tunabilidade por env que o backend real tem (multi-tenant,
// exposto publicamente). Só uma rede de segurança contra abuso do endpoint.
const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 300

export function createApiRateLimiter(): RateLimitRequestHandler {
    return rateLimit({
        windowMs: WINDOW_MS,
        limit: MAX_REQUESTS,
        standardHeaders: true,
        legacyHeaders: false,
        // Desabilitado em teste para não interferir nas suítes que disparam
        // muitas requisições contra a mesma app — mesmo padrão do backend
        // (shared/middlewares/rateLimiter.ts).
        skip: () => env.NODE_ENV === "test",
    })
}
