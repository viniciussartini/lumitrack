import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import type { Request, Response, NextFunction } from "express"
import { createAuthenticateMiddleware, type AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { AuthService } from "@/modules/auth/auth.service.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { generateCsrfToken } from "@/shared/security/csrf.js"
import { UnauthorizedError, ForbiddenError } from "@/shared/errors/AppError.js"

// Testa `authenticate` diretamente (sem HTTP/supertest), invocando a função
// retornada por `createAuthenticateMiddleware` com req/res/next construídos
// à mão — mais rápido e isolado que um teste de rota, e cobre a lógica de
// extração de fonte (header vs cookie) + CSRF inline em um só lugar.
// Usuário e token são reais (banco `lumitrack_test`), seguindo o mesmo
// padrão de `auth.service.test.ts` (sem mock de Prisma neste projeto).

const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined)
const authRepository = new AuthRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const authService = new AuthService(authRepository, mockSendPasswordResetEmail)
const userService = new UserService(userRepository)

const authenticate = createAuthenticateMiddleware(prismaTest)

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL" as const,
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

function makeReq(overrides: {
    headers?: Record<string, string>
    cookies?: Record<string, string>
    method?: string
}): Request {
    return {
        headers: overrides.headers ?? {},
        cookies: overrides.cookies ?? {},
        method: overrides.method ?? "GET",
    } as unknown as Request
}

async function loginAndGetTokens(channel: "WEB" | "MOBILE" = "WEB") {
    await userService.createUser(validUser)
    const { token } = await authService.login({
        email: validUser.email,
        password: validUser.password,
        channel,
    })
    return token
}

beforeEach(async () => {
    await cleanDatabase()
    vi.clearAllMocks()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("authenticate", () => {
    it("autentica via header Authorization (MOBILE) e seta authSource='header'", async () => {
        const token = await loginAndGetTokens("MOBILE")
        const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
        const authReq = req as AuthenticatedRequest
        expect(authReq.authSource).toBe("header")
        expect(authReq.user.email).toBe(validUser.email)
    })

    it("autentica via cookie de sessão (WEB) em GET sem exigir CSRF", async () => {
        const token = await loginAndGetTokens("WEB")
        const req = makeReq({
            cookies: { lumitrack_session: token },
            method: "GET",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
        expect((req as AuthenticatedRequest).authSource).toBe("cookie")
    })

    it("rejeita com 401 quando não há token (nem header, nem cookie)", async () => {
        const req = makeReq({})
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })

    it("rejeita com 403 requisição mutável via cookie sem header CSRF", async () => {
        const token = await loginAndGetTokens("WEB")
        const req = makeReq({
            cookies: { lumitrack_session: token, lumitrack_csrf: generateCsrfToken() },
            method: "POST",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })

    it("rejeita com 403 requisição mutável via cookie com header CSRF divergente do cookie", async () => {
        const token = await loginAndGetTokens("WEB")
        const req = makeReq({
            headers: { "x-csrf-token": generateCsrfToken() },
            cookies: { lumitrack_session: token, lumitrack_csrf: generateCsrfToken() },
            method: "POST",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })

    it("aceita requisição mutável via cookie quando header CSRF == cookie CSRF", async () => {
        const token = await loginAndGetTokens("WEB")
        const csrf = generateCsrfToken()
        const req = makeReq({
            headers: { "x-csrf-token": csrf },
            cookies: { lumitrack_session: token, lumitrack_csrf: csrf },
            method: "POST",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })

    it("aceita requisição mutável via Bearer (MOBILE) mesmo sem CSRF — Bearer é CSRF-resistente por natureza", async () => {
        const token = await loginAndGetTokens("MOBILE")
        const req = makeReq({
            headers: { authorization: `Bearer ${token}` },
            method: "POST",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
    })

    it("header Authorization tem prioridade sobre cookie quando ambos estão presentes", async () => {
        const mobileToken = await loginAndGetTokens("MOBILE")
        const req = makeReq({
            headers: { authorization: `Bearer ${mobileToken}` },
            cookies: { lumitrack_session: "token-de-cookie-nao-deveria-ser-usado" },
            method: "GET",
        })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith()
        expect((req as AuthenticatedRequest).authSource).toBe("header")
    })

    it("rejeita com 401 token revogado vindo do cookie", async () => {
        const token = await loginAndGetTokens("WEB")
        await authService.logout(token)

        const req = makeReq({ cookies: { lumitrack_session: token }, method: "GET" })
        const next = vi.fn() as NextFunction

        await authenticate(req, {} as Response, next)

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    })
})
