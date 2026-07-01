import { randomBytes, timingSafeEqual } from "crypto"

// Token CSRF — valor aleatório de alta entropia, sem necessidade de
// persistência (comparação stateless cookie-vs-header a cada requisição).
export function generateCsrfToken(): string {
    return randomBytes(32).toString("hex")
}

interface CookieOptions {
    httpOnly: boolean
    secure: boolean
    sameSite: "lax"
    path: string
    maxAge: number
}

// Recebe `nodeEnv` por parâmetro (em vez de ler `env.NODE_ENV` direto) para
// permanecer testável em isolamento mesmo com o `NODE_ENV=test` fixado
// globalmente pelo vitest.config.ts — mesmo padrão usado para `envSchema`
// no hardening de CORS/HTTPS (#05).
export function getAuthCookieOptions(nodeEnv: string, maxAgeMs: number): CookieOptions {
    return {
        httpOnly: true,
        secure: nodeEnv === "production",
        sameSite: "lax",
        path: "/",
        maxAge: maxAgeMs,
    }
}

// Cookie CSRF precisa ser legível por JS (double-submit) — única diferença
// em relação ao cookie de sessão é `httpOnly: false`.
export function getCsrfCookieOptions(nodeEnv: string, maxAgeMs: number): CookieOptions {
    return {
        ...getAuthCookieOptions(nodeEnv, maxAgeMs),
        httpOnly: false,
    }
}

// Cookies de refresh: mesmas regras do par de sessão, mas com path restrito
// a "/api/auth" — o browser só os envia para rotas de autenticação, reduzindo
// a superfície de exposição. O CSRF de refresh tem maxAge igual ao refresh
// token (7 d por padrão), diferente do CSRF de sessão (15 min) — a distinção
// é o que permite o endpoint /refresh ser protegido mesmo com o JWT expirado.
export function getRefreshCookieOptions(nodeEnv: string, maxAgeMs: number): CookieOptions {
    return {
        httpOnly: true,
        secure: nodeEnv === "production",
        sameSite: "lax",
        path: "/api/auth",
        maxAge: maxAgeMs,
    }
}

export function getRefreshCsrfCookieOptions(nodeEnv: string, maxAgeMs: number): CookieOptions {
    return {
        ...getRefreshCookieOptions(nodeEnv, maxAgeMs),
        httpOnly: false,
    }
}

// Compara o cookie CSRF com o header enviado pelo cliente (double-submit).
// Usa comparação de tempo constante para evitar timing attacks; checa o
// tamanho antes, já que `timingSafeEqual` lança se os buffers diferirem.
export function validateCsrf(
    cookieValue: string | undefined,
    headerValue: string | undefined,
): boolean {
    if (!cookieValue || !headerValue) {
        return false
    }

    const cookieBuffer = Buffer.from(cookieValue)
    const headerBuffer = Buffer.from(headerValue)

    if (cookieBuffer.length !== headerBuffer.length) {
        return false
    }

    return timingSafeEqual(cookieBuffer, headerBuffer)
}
