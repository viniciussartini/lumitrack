// Nome do cookie CSRF setado pelo backend no login WEB — não-httpOnly,
// por isso pode ser lido aqui (ver backend/src/shared/security/csrf.ts).
const CSRF_COOKIE_NAME = "lumitrack_csrf"
const REFRESH_CSRF_COOKIE_NAME = "lumitrack_refresh_csrf"

function readCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]!) : null
}

// Lê o valor do cookie CSRF direto de `document.cookie` (double-submit
// cookie pattern). Sem dependência nova — parsing simples por regex.
export const getCsrfToken = (): string | null => readCookie(CSRF_COOKIE_NAME)

// Cookie CSRF dedicado para o endpoint de refresh — tem maxAge mais longo
// (igual ao do refresh token, ~7d) para sobreviver à expiração do JWT de
// sessão de 15 min.
export const getRefreshCsrfToken = (): string | null => readCookie(REFRESH_CSRF_COOKIE_NAME)
