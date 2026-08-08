import { describe, it, expect, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { requireApiToken } from "@/api/middlewares/apiToken.js"
import { UnauthorizedError } from "@/shared/errors.js"

function createRequest(authorization?: string): Request {
    return { headers: { authorization } } as unknown as Request
}

describe("requireApiToken", () => {
    const middleware = requireApiToken("token-correto-de-teste")

    it("chama next() sem erro quando o token bate", () => {
        const next = vi.fn() as NextFunction
        middleware(createRequest("Bearer token-correto-de-teste"), {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })

    it("chama next(UnauthorizedError) quando o header está ausente", () => {
        const next = vi.fn() as NextFunction
        middleware(createRequest(undefined), {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })

    it("chama next(UnauthorizedError) quando o header não tem prefixo Bearer", () => {
        const next = vi.fn() as NextFunction
        middleware(createRequest("token-correto-de-teste"), {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })

    it("chama next(UnauthorizedError) quando o token está errado", () => {
        const next = vi.fn() as NextFunction
        middleware(createRequest("Bearer token-errado"), {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })

    it("chama next(UnauthorizedError) quando o token tem tamanho diferente do esperado", () => {
        const next = vi.fn() as NextFunction
        middleware(createRequest("Bearer curto"), {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })
})
