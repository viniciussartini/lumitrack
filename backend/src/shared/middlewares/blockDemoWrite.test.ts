import { describe, it, expect, vi } from "vitest"
import type { Request, Response, NextFunction } from "express"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"

// Mesmo padrão de requireRole.test.ts — req/res/next construídos à mão, sem
// HTTP/supertest. blockDemoWrite é síncrono e não toca o banco (isDemo já
// vem populado por authenticate antes dele rodar na cadeia de rota).

function makeAuthenticatedReq(isDemo: boolean): AuthenticatedRequest {
    return {
        user: {
            id: "user-1",
            email: "user@example.com",
            userType: "INDIVIDUAL",
            role: "USER",
            isDemo,
        },
    } as unknown as AuthenticatedRequest
}

describe("blockDemoWrite", () => {
    it("chama next(ForbiddenError) quando a conta é demo", () => {
        const req = makeAuthenticatedReq(true) as unknown as Request
        const next = vi.fn() as NextFunction

        blockDemoWrite(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })

    it("chama next() sem erro quando a conta não é demo", () => {
        const req = makeAuthenticatedReq(false) as unknown as Request
        const next = vi.fn() as NextFunction

        blockDemoWrite(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })
})
