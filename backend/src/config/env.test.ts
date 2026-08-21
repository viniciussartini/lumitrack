import { describe, it, expect } from "vitest"
import { envSchema } from "@/config/env.js"

// Conjunto mínimo de variáveis obrigatórias (sem defaults) para isolar
// o que cada teste realmente quer verificar.
const baseValidEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    JWT_SECRET: "a".repeat(32),
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "user",
    SMTP_PASS: "pass",
    SMTP_FROM: "no-reply@example.com",
    CPF_CNPJ_ENCRYPTION_KEY: "a".repeat(64),
    CPF_CNPJ_BLIND_INDEX_KEY: "b".repeat(64),
    MFA_SECRET_ENCRYPTION_KEY: "c".repeat(64),
    ADDRESS_ENCRYPTION_KEY: "d".repeat(64),
    METER_CREDENTIAL_ENCRYPTION_KEY: "e".repeat(64),
    // Não-default de propósito — o default de localhost é rejeitado em
    // produção pelo guard de PUBLIC_API_ORIGIN (ver describe abaixo), e a
    // maioria dos testes deste arquivo usa NODE_ENV=production só para
    // exercitar outro guard, não este.
    PUBLIC_API_ORIGIN: "https://api.lumitrack.example",
}

describe("envSchema — guard CORS_ORIGIN em produção (A02)", () => {
    it("rejeita CORS_ORIGIN='*' quando NODE_ENV=production", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "production",
            CORS_ORIGIN: "*",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "CORS_ORIGIN")
            expect(issue).toBeDefined()
            expect(issue?.message).toMatch(/não pode ser '\*' em produção/)
        }
    })

    it("aceita CORS_ORIGIN específico quando NODE_ENV=production", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "production",
            CORS_ORIGIN: "https://app.lumitrack.com",
        })

        expect(result.success).toBe(true)
    })

    it("permite CORS_ORIGIN='*' em development (guard só vale para produção)", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "development",
            CORS_ORIGIN: "*",
        })

        expect(result.success).toBe(true)
    })
})

describe("envSchema — guard PUBLIC_API_ORIGIN em produção (issue #183)", () => {
    it("rejeita o default de localhost quando NODE_ENV=production", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "production",
            PUBLIC_API_ORIGIN: "http://localhost:3333",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "PUBLIC_API_ORIGIN")
            expect(issue).toBeDefined()
            expect(issue?.message).toMatch(/domínio real em produção/)
        }
    })

    it("aceita um domínio real quando NODE_ENV=production", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "production",
            PUBLIC_API_ORIGIN: "https://api.lumitrack.com",
        })

        expect(result.success).toBe(true)
    })

    it("permite o default de localhost em development (guard só vale para produção)", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "development",
            PUBLIC_API_ORIGIN: "http://localhost:3333",
        })

        expect(result.success).toBe(true)
    })

    it("rejeita valor que não é uma URL", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            PUBLIC_API_ORIGIN: "não-e-uma-url",
        })

        expect(result.success).toBe(false)
    })

    it("aplica o default de localhost quando ausente", () => {
        const { PUBLIC_API_ORIGIN: _omit, ...rest } = baseValidEnv
        const result = envSchema.safeParse(rest)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.PUBLIC_API_ORIGIN).toBe("http://localhost:3333")
        }
    })
})

describe("envSchema — JWT_WEB_EXPIRES_IN (issue #215)", () => {
    it("aplica default de 1h quando ausente — Render não define esta env var, então o default é o que vale em produção", () => {
        const result = envSchema.safeParse(baseValidEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.JWT_WEB_EXPIRES_IN).toBe("1h")
        }
    })
})

describe("envSchema — DATABASE_TEST_URL/DATABASE_HTTP_TEST_URL (#165)", () => {
    it("rejeita NODE_ENV=test sem DATABASE_TEST_URL", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "test",
            DATABASE_HTTP_TEST_URL: "postgresql://user:pass@localhost:5432/db_test_http",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "DATABASE_TEST_URL")
            expect(issue).toBeDefined()
        }
    })

    it("rejeita NODE_ENV=test sem DATABASE_HTTP_TEST_URL", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "test",
            DATABASE_TEST_URL: "postgresql://user:pass@localhost:5432/db_test",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "DATABASE_HTTP_TEST_URL")
            expect(issue).toBeDefined()
        }
    })

    it("não exige DATABASE_TEST_URL/DATABASE_HTTP_TEST_URL fora de NODE_ENV=test", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, NODE_ENV: "production" })

        expect(result.success).toBe(true)
    })

    it("rejeita DATABASE_TEST_URL igual a DATABASE_URL — apagaria o banco de desenvolvimento", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "test",
            DATABASE_TEST_URL: baseValidEnv.DATABASE_URL,
            DATABASE_HTTP_TEST_URL: "postgresql://user:pass@localhost:5432/db_test_http",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "DATABASE_TEST_URL")
            expect(issue?.message).toMatch(/não pode ser igual a DATABASE_URL/)
        }
    })

    it("rejeita DATABASE_HTTP_TEST_URL igual a DATABASE_URL — apagaria o banco de desenvolvimento", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "test",
            DATABASE_TEST_URL: "postgresql://user:pass@localhost:5432/db_test",
            DATABASE_HTTP_TEST_URL: baseValidEnv.DATABASE_URL,
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path[0] === "DATABASE_HTTP_TEST_URL")
            expect(issue?.message).toMatch(/não pode ser igual a DATABASE_URL/)
        }
    })

    it("aceita NODE_ENV=test com as duas URLs de teste distintas de DATABASE_URL", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "test",
            DATABASE_TEST_URL: "postgresql://user:pass@localhost:5432/db_test",
            DATABASE_HTTP_TEST_URL: "postgresql://user:pass@localhost:5432/db_test_http",
        })

        expect(result.success).toBe(true)
    })
})
