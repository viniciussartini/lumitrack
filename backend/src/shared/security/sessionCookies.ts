import type { Response } from "express"
import { env } from "@/config/env.js"
import {
    getAuthCookieOptions,
    getCsrfCookieOptions,
    getRefreshCookieOptions,
    getRefreshCsrfCookieOptions,
} from "@/shared/security/csrf.js"

/**
 * Remove do navegador os quatro cookies da sessão web (acesso, CSRF, refresh e
 * CSRF do refresh). `clearCookie` exige os mesmos atributos usados na criação
 * (path, secure, sameSite), senão o navegador ignora a remoção.
 *
 * @param res - Resposta HTTP Express.
 */
export function clearSessionCookies(res: Response): void {
    res.clearCookie(env.AUTH_COOKIE_NAME, getAuthCookieOptions(env.NODE_ENV, 0))
    res.clearCookie(env.CSRF_COOKIE_NAME, getCsrfCookieOptions(env.NODE_ENV, 0))
    res.clearCookie(env.REFRESH_COOKIE_NAME, getRefreshCookieOptions(env.NODE_ENV, 0))
    res.clearCookie(env.REFRESH_CSRF_COOKIE_NAME, getRefreshCsrfCookieOptions(env.NODE_ENV, 0))
}
