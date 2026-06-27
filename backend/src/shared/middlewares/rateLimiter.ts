import rateLimit, {
    ipKeyGenerator,
    type Options,
    type RateLimitRequestHandler,
} from "express-rate-limit"
import { env } from "@/config/env.js"
import { TooManyRequestsError } from "@/shared/errors/AppError.js"

// Em ambiente de teste o rate limit é desabilitado por padrão para não
// interferir nas suítes que disparam muitas requisições contra a mesma app.
// Pode ser forçado em um teste específico via override `skip: () => false`.
const skipInTest = () => env.NODE_ENV === "test"

// Opções compartilhadas: headers padronizados (RateLimit-*) e resposta no
// formato de erro padrão da aplicação, delegada ao errorHandler global via next().
const sharedOptions: Partial<Options> = {
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
}

// Limiter global moderado — rede de segurança por IP para toda a API.
export function createGlobalRateLimiter(
    overrides: Partial<Options> = {},
): RateLimitRequestHandler {
    return rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        limit: env.RATE_LIMIT_MAX,
        skip: skipInTest,
        ...sharedOptions,
        ...overrides,
    })
}

// Limiter estrito para os endpoints públicos de autenticação.
// Chave por IP + e-mail: mitiga brute force/credential stuffing contra um alvo
// específico sem penalizar todo um IP compartilhado (NAT corporativo, etc.).
// `ipKeyGenerator` normaliza o IP (inclusive IPv6) conforme exigido pela lib.
export function createAuthRateLimiter(
    overrides: Partial<Options> = {},
): RateLimitRequestHandler {
    return rateLimit({
        windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
        limit: env.AUTH_RATE_LIMIT_MAX,
        skip: skipInTest,
        keyGenerator: (req) => {
            const ip = ipKeyGenerator(req.ip ?? "")
            const email =
                typeof req.body?.email === "string"
                    ? req.body.email.toLowerCase()
                    : ""
            return `${ip}:${email}`
        },
        ...sharedOptions,
        ...overrides,
    })
}
