// Nome do cookie CSRF setado pelo backend no login WEB — não-httpOnly,
// por isso pode ser lido aqui (ver backend/src/shared/security/csrf.ts).
const CSRF_COOKIE_NAME = "lumitrack_csrf"

// Lê o valor do cookie CSRF direto de `document.cookie` (double-submit
// cookie pattern). Sem dependência nova — parsing simples por regex.
export const getCsrfToken = (): string | null => {
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`),
    )
    return match ? decodeURIComponent(match[1]!) : null
}
