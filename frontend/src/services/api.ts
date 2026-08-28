import axios, { AxiosError } from "axios"
import { getCsrfToken, getRefreshCsrfToken } from "@/lib/csrf"
import { authState } from "@/lib/authState"

// Métodos mutáveis precisam do header CSRF quando autenticados via cookie
// httpOnly (double-submit cookie pattern — ver backend/shared/security/csrf.ts).
const MUTABLE_METHODS = new Set(["post", "put", "patch", "delete"])

export const api = axios.create({
    baseURL: "/api",
    headers: {
        "Content-Type": "application/json",
    },
    // Necessário para o browser enviar/receber o cookie de sessão httpOnly.
    withCredentials: true,
})

api.interceptors.request.use((config) => {
    if (config.method && MUTABLE_METHODS.has(config.method)) {
        const csrfToken = getCsrfToken()
        if (csrfToken) {
            config.headers["X-CSRF-Token"] = csrfToken
        }
    }
    return config
})

// Promise em voo compartilhada — N chamadas concorrentes a ensureFreshSession
// (o interceptor abaixo e o timer proativo de sessionRefresh.ts) aguardam o
// mesmo POST /auth/refresh em vez de disparar N.
let refreshPromise: Promise<void> | null = null

/**
 * Renova a sessão WEB via refresh token httpOnly, deduplicando chamadas
 * concorrentes. Não retorna dados — o backend sobrescreve os cookies de
 * sessão. O header CSRF de refresh é injetado manualmente (o interceptor
 * de request acima usa o CSRF de sessão, que pode estar expirado agora).
 *
 * Vive em api.ts (não em sessionRefresh.ts/auth.service.ts) porque o
 * interceptor de 401 abaixo precisa chamá-la — um import de volta para
 * sessionRefresh.ts criaria um ciclo (dependency-cruiser no-circular,
 * 03-arquitetura.md), já que sessionRefresh.ts depende de auth.service.ts,
 * que depende deste módulo.
 */
export async function ensureFreshSession(): Promise<void> {
    if (refreshPromise) return refreshPromise

    refreshPromise = api
        .post(
            "/auth/refresh",
            {},
            { headers: { "x-refresh-csrf-token": getRefreshCsrfToken() ?? "" } },
        )
        .then(() => undefined)
        .finally(() => {
            refreshPromise = null
        })

    return refreshPromise
}

/**
 * Response interceptor
 * Heurística para distinguir "sessão expirada" de "login falhou":
 *   - 401 COM sessão ativa (authState) → tenta renovar via refresh token;
 *     se conseguir, reemite a requisição original (uma única vez);
 *     se falhar, limpa o estado e dispara `lumitrack:unauthorized`.
 *   - 401 SEM sessão ativa             → credenciais erradas (propaga o erro).
 *
 * `authState` é sincronizado pelo AuthContext a cada mudança de `user` —
 * não há token legível em JS (cookie httpOnly) para basear essa decisão.
 */
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const config = error.config

        if (
            error.response?.status === 401 &&
            authState.getHasSession() &&
            config &&
            !config.url?.includes("/auth/refresh") &&
            !(config as typeof config & { _isRetry?: boolean })._isRetry
        ) {
            try {
                await ensureFreshSession()
                ;(config as typeof config & { _isRetry?: boolean })._isRetry = true
                return api.request(config)
            } catch {
                authState.setHasSession(false)
                window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
            }
        } else if (error.response?.status === 401 && authState.getHasSession()) {
            authState.setHasSession(false)
            window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
        }

        return Promise.reject(error)
    },
)

export const extractErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error)) {
        const data: unknown = error.response?.data
        if (typeof data === "object" && data !== null && "message" in data) {
            const message = (data as { message: unknown }).message
            if (typeof message === "string" && message.length > 0) {
                return message
            }
        }
        if (error.message) return error.message
    }
    if (error instanceof Error && error.message) return error.message
    return "Erro inesperado. Tente novamente."
}
