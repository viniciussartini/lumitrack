import { describe, it, expect } from "vitest"
import {
    generateCsrfToken,
    getAuthCookieOptions,
    getCsrfCookieOptions,
    validateCsrf,
} from "@/shared/security/csrf.js"

describe("generateCsrfToken", () => {
    it("gera um token de 64 caracteres hex (32 bytes)", () => {
        const token = generateCsrfToken()
        expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it("gera tokens diferentes a cada chamada", () => {
        expect(generateCsrfToken()).not.toBe(generateCsrfToken())
    })
})

describe("getAuthCookieOptions", () => {
    it("secure:true quando nodeEnv é production", () => {
        const options = getAuthCookieOptions("production", 900_000)
        expect(options).toEqual({
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 900_000,
        })
    })

    it("secure:false quando nodeEnv é development", () => {
        const options = getAuthCookieOptions("development", 900_000)
        expect(options.secure).toBe(false)
        expect(options.httpOnly).toBe(true)
    })

    it("secure:false quando nodeEnv é test", () => {
        expect(getAuthCookieOptions("test", 900_000).secure).toBe(false)
    })
})

describe("getCsrfCookieOptions", () => {
    it("é idêntico ao cookie de sessão exceto httpOnly:false", () => {
        const auth = getAuthCookieOptions("production", 900_000)
        const csrf = getCsrfCookieOptions("production", 900_000)

        expect(csrf).toEqual({ ...auth, httpOnly: false })
    })
})

describe("validateCsrf", () => {
    it("retorna true quando cookie e header são idênticos", () => {
        const token = generateCsrfToken()
        expect(validateCsrf(token, token)).toBe(true)
    })

    it("retorna false quando cookie e header diferem", () => {
        expect(validateCsrf(generateCsrfToken(), generateCsrfToken())).toBe(false)
    })

    it("retorna false quando o cookie está ausente", () => {
        expect(validateCsrf(undefined, generateCsrfToken())).toBe(false)
    })

    it("retorna false quando o header está ausente", () => {
        expect(validateCsrf(generateCsrfToken(), undefined)).toBe(false)
    })

    it("retorna false quando ambos estão ausentes", () => {
        expect(validateCsrf(undefined, undefined)).toBe(false)
    })

    it("retorna false sem lançar quando os tamanhos diferem", () => {
        expect(() => validateCsrf("abc", "abcdef")).not.toThrow()
        expect(validateCsrf("abc", "abcdef")).toBe(false)
    })
})
