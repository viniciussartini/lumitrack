import axios, { AxiosError } from "axios"
import { storage, STORAGE_KEYS } from "@/lib/storage"

export const api = axios.create({
    baseURL: "/api",
    headers: {
        "Content-Type": "application/json",
    },
})

api.interceptors.request.use((config) => {
    const token = storage.get(STORAGE_KEYS.TOKEN)
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

/**
 * Response interceptor 
 * Heurística para distinguir "sessão expirada" de "login falhou":
 *   - 401 COM token salvo  → sessão expirou (dispara evento de logout)
 *   - 401 SEM token salvo  → tentativa de login com credenciais erradas
 *                             (apenas propaga o erro para a UI exibir)
 * 
 * Esta abordagem é mais robusta que filtrar por URL, porque
 * `error.config?.url` pode chegar inconsistente entre browsers/ambientes.
 */

api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            const hadToken = storage.get(STORAGE_KEYS.TOKEN) !== null
            if (hadToken) {
                storage.remove(STORAGE_KEYS.TOKEN)
                window.dispatchEvent(new CustomEvent("lumitrack:unauthorized"))
            }
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