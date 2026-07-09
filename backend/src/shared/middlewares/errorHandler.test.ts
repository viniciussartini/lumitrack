import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { ZodError, z } from "zod"
import { createErrorHandler } from "@/shared/middlewares/errorHandler.js"
import { ForbiddenError, ConflictError } from "@/shared/errors/AppError.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { logger } from "@/shared/logger/logger.js"

function makeReq(overrides: Partial<Request> = {}): Request {
    return {
        path: "/api/properties/prop-123",
        originalUrl: "/api/properties/prop-123",
        method: "DELETE",
        params: { id: "prop-123" },
        headers: {},
        ip: "127.0.0.1",
        ...overrides,
    } as unknown as Request
}

function makeRes(): Response {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response
}

describe("createErrorHandler", () => {
    let auditService: AuditService
    let errorHandler: ReturnType<typeof createErrorHandler>

    beforeEach(() => {
        auditService = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService
        errorHandler = createErrorHandler(auditService)
    })

    it("retorna 422 com issues para ZodError, sem auditar", async () => {
        const schema = z.object({ email: z.string() })
        const zodError = schema.safeParse({}).error as ZodError
        const res = makeRes()

        await errorHandler(zodError, makeReq(), res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(422)
        expect(auditService.record).not.toHaveBeenCalled()
    })

    it("retorna o statusCode/message de um AppError genérico, sem auditar", async () => {
        const res = makeRes()

        await errorHandler(new ConflictError("E-mail já cadastrado"), makeReq(), res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.json).toHaveBeenCalledWith({ status: "error", message: "E-mail já cadastrado" })
        expect(auditService.record).not.toHaveBeenCalled()
    })

    it("audita ACCESS_DENIED para ForbiddenError, inferindo resourceType/resourceId", async () => {
        const res = makeRes()
        const req = makeReq({
            user: { id: "user-1", email: "x@x.com", userType: "INDIVIDUAL" },
        } as Partial<Request>)

        await errorHandler(new ForbiddenError("Acesso negado"), req, res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(403)
        expect(auditService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-1",
                action: "ACCESS_DENIED",
                outcome: "FAILURE",
                resourceType: "properties",
                resourceId: "prop-123",
            }),
        )
    })

    it("audita ACCESS_DENIED com userId null quando a requisição não está autenticada (ex: CSRF)", async () => {
        const res = makeRes()

        await errorHandler(new ForbiddenError("Token CSRF inválido"), makeReq(), res, vi.fn())

        expect(auditService.record).toHaveBeenCalledWith(
            expect.objectContaining({ userId: null, action: "ACCESS_DENIED" }),
        )
    })

    it("loga e retorna 500 para erro inesperado, sem auditar", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined as never)
        const res = makeRes()

        await errorHandler(new Error("bug"), makeReq(), res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(500)
        expect(errorSpy).toHaveBeenCalled()
        expect(auditService.record).not.toHaveBeenCalled()

        errorSpy.mockRestore()
    })
})
