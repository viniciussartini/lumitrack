import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { authState } from "@/lib/authState"
import { api, ensureFreshSession } from "@/services/api"

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

// ensureFreshSession chama api.post("/auth/refresh", ...) internamente —
// mockamos esse método diretamente na instância real do axios em vez de
// mockar o módulo inteiro (api.ts não expõe mais um handler injetável, ver
// comentário lá sobre por que essa lógica vive no próprio módulo).
const postSpy = vi.spyOn(api, "post")

beforeEach(() => {
    document.cookie = "lumitrack_csrf=; Max-Age=0"
    authState.setHasSession(false)
    postSpy.mockReset()
    // Por padrão, refresh bem-sucedido (sobrescreve nos testes de falha).
    postSpy.mockResolvedValue({} as AxiosResponse)
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

describe("ensureFreshSession", () => {
    it("chama api.post(/auth/refresh) exatamente uma vez mesmo sob chamadas concorrentes", async () => {
        // N chamadas paralelas — só 1 POST deve acontecer.
        await Promise.all([ensureFreshSession(), ensureFreshSession(), ensureFreshSession()])

        expect(postSpy).toHaveBeenCalledTimes(1)
        expect(postSpy).toHaveBeenCalledWith("/auth/refresh", {}, expect.anything())
    })

    it("injeta o cookie de CSRF de refresh no header x-refresh-csrf-token", async () => {
        document.cookie = "lumitrack_refresh_csrf=meu-token-de-refresh"

        await ensureFreshSession()

        expect(postSpy).toHaveBeenCalledWith(
            "/auth/refresh",
            {},
            { headers: { "x-refresh-csrf-token": "meu-token-de-refresh" } },
        )

        document.cookie = "lumitrack_refresh_csrf=; Max-Age=0"
    })

    it("envia string vazia no header quando não há cookie de CSRF de refresh", async () => {
        await ensureFreshSession()

        expect(postSpy).toHaveBeenCalledWith(
            "/auth/refresh",
            {},
            { headers: { "x-refresh-csrf-token": "" } },
        )
    })

    it("chamadas posteriores à conclusão do primeiro refresh iniciam um novo", async () => {
        await ensureFreshSession()
        await ensureFreshSession()

        expect(postSpy).toHaveBeenCalledTimes(2)
    })

    it("propaga erro quando api.post rejeita", async () => {
        postSpy.mockRejectedValue(new Error("refresh falhou"))

        await expect(ensureFreshSession()).rejects.toThrow("refresh falhou")
    })
})

describe("api — interceptor de response (401)", () => {
    it("tenta renovar a sessão quando há sessão ativa (não é retry)", async () => {
        authState.setHasSession(true)

        // ensureFreshSession resolve, mas api.request vai falhar porque
        // não há servidor real — apenas verificamos que foi chamado.
        await expect(
            responseRejectedInterceptor(make401Error("/api/properties")),
        ).rejects.toBeDefined()

        expect(postSpy).toHaveBeenCalledTimes(1)
    })

    it("dispara lumitrack:unauthorized quando a renovação falha", async () => {
        authState.setHasSession(true)
        postSpy.mockRejectedValue(new Error("refresh falhou"))

        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/properties")),
        ).rejects.toBeDefined()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(authState.getHasSession()).toBe(false)

        window.removeEventListener("lumitrack:unauthorized", handler)
    })

    it("NÃO tenta renovar em retries (_isRetry) — evita loop", async () => {
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

        expect(postSpy).not.toHaveBeenCalled()
        expect(handler).toHaveBeenCalledTimes(1)

        window.removeEventListener("lumitrack:unauthorized", handler)
    })

    it("NÃO tenta renovar em 401 do próprio /auth/refresh", async () => {
        authState.setHasSession(true)
        const handler = vi.fn()
        window.addEventListener("lumitrack:unauthorized", handler)

        await expect(
            responseRejectedInterceptor(make401Error("/api/auth/refresh")),
        ).rejects.toBeDefined()

        expect(postSpy).not.toHaveBeenCalled()
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
        expect(postSpy).not.toHaveBeenCalled()

        window.removeEventListener("lumitrack:unauthorized", handler)
    })
})
