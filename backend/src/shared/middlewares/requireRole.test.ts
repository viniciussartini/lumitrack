import { describe, it, expect, vi } from "vitest"
import type { Request, Response, NextFunction } from "express"
import { requireRole } from "@/shared/middlewares/requireRole.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { ForbiddenError } from "@/shared/errors/AppError.js"

// Mesmo padrão de authenticate.test.ts — req/res/next construídos à mão,
// sem HTTP/supertest. requireRole é síncrono e não toca o banco (a role já
// vem populada por authenticate antes dele rodar na cadeia de rota).

function makeAuthenticatedReq(role: "USER" | "ADMIN"): AuthenticatedRequest {
    return {
        user: { id: "user-1", email: "user@example.com", userType: "INDIVIDUAL", role },
    } as unknown as AuthenticatedRequest
}

describe("requireRole", () => {
    it("chama next() sem erro quando a role do usuário está na lista permitida", () => {
        const req = makeAuthenticatedReq("ADMIN") as unknown as Request
        const next = vi.fn() as NextFunction

        requireRole("ADMIN")(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })

    it("chama next(ForbiddenError) quando a role do usuário não está na lista permitida", () => {
        const req = makeAuthenticatedReq("USER") as unknown as Request
        const next = vi.fn() as NextFunction

        requireRole("ADMIN")(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })

    it("aceita múltiplas roles permitidas", () => {
        const req = makeAuthenticatedReq("USER") as unknown as Request
        const next = vi.fn() as NextFunction

        requireRole("USER", "ADMIN")(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })
})
