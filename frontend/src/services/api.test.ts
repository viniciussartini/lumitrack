import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AxiosError, InternalAxiosRequestConfig } from "axios"
import { authState } from "@/lib/authState"

// Mock do sessionRefresh — evita chamadas reais ao backend nos testes
// unitários do interceptor.
vi.mock("@/lib/sessionRefresh", () => ({
    ensureFreshSession: vi.fn(),
}))

import { ensureFreshSession } from "@/lib/sessionRefresh"
import { api } from "@/services/api"

// Os interceptors são testados diretamente via `interceptors.request/response
// .handlers` (API interna do axios, mas estável) — evita ter que mockar a
// camada de rede inteira só para validar a lógica que adicionamos em cima
// do axios.create().
const requestInterceptor = (
    api.interceptors.request as unknown as {
        handlers: {
            fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
        }[]
    }
).handlers[0]!.fulfilled

const responseRejectedInterceptor = (
    api.interceptors.response as unknown as {
        handlers: { rejected: (error: AxiosError) => Promise<unknown> }[]
    }
).handlers[0]!.rejected

function makeConfig(method: string, url = "/api/properties"): InternalAxiosRequestConfig {
    return { method, url, headers: {} } as unknown as InternalAxiosRequestConfig
}

function make401Error(url: string, config?: Partial<InternalAxiosRequestConfig>): AxiosError {
    return {
        response: { status: 401 },
        config: { url, headers: {}, ...config },
    } as unknown as AxiosError
}

const mockEnsureFreshSession = vi.mocked(ensureFreshSession)

beforeEach(() => {
    document.cookie = "lumitrack_csrf=; Max-Age=0"
    authState.setHasSession(false)
    vi.clearAllMocks()
    // Por padrão, refresh bem-sucedido (sobrescreve nos testes de falha).
    mockEnsureFreshSession.mockResolvedValue(undefined)
})

describe("api — interceptor de request (CSRF)", () => {
    it("injeta X-CSRF-Token em métodos mutáveis quando há cookie CSRF", () => {
        document.cookie = "lumitrack_csrf=meu-token-csrf"

        const config = requestInterceptor(makeConfig("post"))

        expect(config.headers["X-CSRF-Token"]).toBe("meu-token-csrf")
    })

    it("não injeta header CSRF em GET", () => {
        document.cookie = "lumitrack_csrf=meu-token-csrf"

        const config = requestInterceptor(makeConfig("get"))

        expect(config.headers["X-CSRF-Token"]).toBeUndefined()
    })

    it("não injeta header quando não há cookie CSRF", () => {
        const config = requestInterceptor(makeConfig("post"))

        expect(config.headers["X-CSRF-Token"]).toBeUndefined()
    })
})

describe("api — interceptor de response (401)", () => {
    it("tenta ensureFreshSession quando há sessão ativa (não é retry)", async () => {
        authState.setHasSession(true)

        // ensureFreshSession resolve, mas api.request vai falhar porque
        // não há servidor real — apenas verificamos que foi chamado.
        mockEnsureFreshSession.mockResolvedValue(undefined)

        // Rejeição pode acontecer por vários motivos depois do refresh — o
        // que importa é que ensureFreshSession foi invocado.
        await expect(
            responseRejectedInterceptor(make401Error("/api/properties")),
        ).rejects.toBeDefined()

        expect(mockEnsureFreshSession).toHaveBeenCalledTimes(1)
    })

    it("dispara lumitrack:unauthorized quando ensureFreshSession falha", async () => {
        authState.setHasSession(true)
        mockEnsureFreshSession.mockRejectedValue(new Error("refresh falhou"))

        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/properties")),
        ).rejects.toBeDefined()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(authState.getHasSession()).toBe(false)

        window.removeEventListener("lumitrack:unauthorized", handler)
    })

    it("NÃO chama ensureFreshSession em retries (_isRetry) — evita loop", async () => {
        authState.setHasSession(true)
        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(
                make401Error("/api/properties", {
                    _isRetry: true,
                } as unknown as Partial<InternalAxiosRequestConfig>),
            ),
        ).rejects.toBeDefined()

        expect(mockEnsureFreshSession).not.toHaveBeenCalled()
        expect(handler).toHaveBeenCalledTimes(1)

        window.removeEventListener("lumitrack:unauthorized", handler)
    })

    it("NÃO chama ensureFreshSession em 401 do próprio /auth/refresh", async () => {
        authState.setHasSession(true)
        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/auth/refresh")),
        ).rejects.toBeDefined()

        expect(mockEnsureFreshSession).not.toHaveBeenCalled()
        // Cai no else que limpa sessão e dispara o evento
        expect(handler).toHaveBeenCalledTimes(1)

        window.removeEventListener("lumitrack:unauthorized", handler)
    })

    it("NÃO dispara o evento quando não há sessão ativa (ex.: login com credenciais erradas)", async () => {
        authState.setHasSession(false)
        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/auth/login")),
        ).rejects.toBeDefined()

        expect(handler).not.toHaveBeenCalled()
        expect(mockEnsureFreshSession).not.toHaveBeenCalled()

        window.removeEventListener("lumitrack:unauthorized", handler)
    })
})
