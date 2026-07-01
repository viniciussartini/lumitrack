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
