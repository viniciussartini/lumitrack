import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AxiosError, InternalAxiosRequestConfig } from "axios"
import { api } from "@/services/api"
import { authState } from "@/lib/authState"

// Os interceptors são testados diretamente via `interceptors.request/response
// .handlers` (API interna do axios, mas estável) — evita ter que mockar a
// camada de rede inteira só para validar a lógica que adicionamos em cima
// do axios.create().
const requestInterceptor = (
    api.interceptors.request as unknown as {
        handlers: { fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }[]
    }
).handlers[0]!.fulfilled

const responseRejectedInterceptor = (
    api.interceptors.response as unknown as {
        handlers: { rejected: (error: AxiosError) => Promise<never> }[]
    }
).handlers[0]!.rejected

function makeConfig(method: string): InternalAxiosRequestConfig {
    return { method, headers: {} } as unknown as InternalAxiosRequestConfig
}

function make401Error(url: string): AxiosError {
    return {
        response: { status: 401 },
        config: { url },
    } as unknown as AxiosError
}

beforeEach(() => {
    document.cookie = "lumitrack_csrf=; Max-Age=0"
    authState.setHasSession(false)
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
    it("dispara lumitrack:unauthorized quando há sessão ativa", async () => {
        authState.setHasSession(true)
        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/properties")),
        ).rejects.toBeDefined()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(authState.getHasSession()).toBe(false)

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

        window.removeEventListener("lumitrack:unauthorized", handler)
    })
})
