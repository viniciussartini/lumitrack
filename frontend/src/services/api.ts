import axios, { AxiosError } from "axios"
import { getCsrfToken } from "@/lib/csrf"
import { authState } from "@/lib/authState"
import { ensureFreshSession } from "@/lib/sessionRefresh"

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
