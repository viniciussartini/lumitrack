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

describe("envSchema — REGISTRATION_ENABLED default fail-closed (ADR-0014)", () => {
    it("aplica default `false` quando ausente — nenhum ambiente que esqueça de configurar nasce com cadastro aberto", () => {
        const result = envSchema.safeParse(baseValidEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.REGISTRATION_ENABLED).toBe(false)
        }
    })

    it("liga com REGISTRATION_ENABLED='true' — z.stringbool() interpreta a string, não z.coerce.boolean()", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, REGISTRATION_ENABLED: "true" })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.REGISTRATION_ENABLED).toBe(true)
        }
    })

    it("mantém desligado com REGISTRATION_ENABLED='false' — não pode virar true por coerção", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, REGISTRATION_ENABLED: "false" })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.REGISTRATION_ENABLED).toBe(false)
        }
    })
})

describe("envSchema — DEBUG_QUERY_LOGGING_ENABLED fail-closed em produção", () => {
    it("aplica default `false` quando ausente", () => {
        const result = envSchema.safeParse(baseValidEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DEBUG_QUERY_LOGGING_ENABLED).toBe(false)
        }
    })

    it("liga em development", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "development",
            DEBUG_QUERY_LOGGING_ENABLED: "true",
        })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DEBUG_QUERY_LOGGING_ENABLED).toBe(true)
        }
    })

    it("rejeita DEBUG_QUERY_LOGGING_ENABLED='true' quando NODE_ENV=production", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            NODE_ENV: "production",
            DEBUG_QUERY_LOGGING_ENABLED: "true",
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues.find(
                (i) => i.path[0] === "DEBUG_QUERY_LOGGING_ENABLED",
            )
            expect(issue).toBeDefined()
            expect(issue?.message).toMatch(/não pode ser true em produção/)
        }
    })
})

describe("envSchema — DATA_RETENTION_* falha fechado contra valor vazio/zero/negativo", () => {
    // z.coerce.number() sozinho aceita "" (Number("") === 0) e negativo — sem
    // .int().positive(), uma variável mal configurada (chave presente, valor
    // vazio) faria daysAgo(0) apontar para "agora", e o expurgo apagaria a
    // tabela inteira em vez de só o que passou do prazo. Representativo:
    // testa uma das 8 chaves — todas usam a mesma regra.
    it("rejeita string vazia", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DATA_RETENTION_METER_READING_DAYS: "",
        })

        expect(result.success).toBe(false)
    })

    it("rejeita zero", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DATA_RETENTION_METER_READING_DAYS: "0",
        })

        expect(result.success).toBe(false)
    })

    it("rejeita negativo", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DATA_RETENTION_METER_READING_DAYS: "-5",
        })

        expect(result.success).toBe(false)
    })

    it("rejeita não-inteiro", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DATA_RETENTION_METER_READING_DAYS: "1.5",
        })

        expect(result.success).toBe(false)
    })

    it("aceita um inteiro positivo válido", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DATA_RETENTION_METER_READING_DAYS: "90",
        })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DATA_RETENTION_METER_READING_DAYS).toBe(90)
        }
    })

    it("aplica o default 365 quando ausente", () => {
        const result = envSchema.safeParse(baseValidEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DATA_RETENTION_METER_READING_DAYS).toBe(365)
        }
    })
})

describe("envSchema — DB_POOL_* falha fechado contra valor vazio/zero/negativo", () => {
    // Mesma regra das DATA_RETENTION_*: sem .int().positive(), um pool com
    // max <= 0 (ou timeout <= 0) passaria pelo schema e derrubaria toda
    // conexão ao banco só no boot do driver `pg`, não na validação de env.
    it("rejeita string vazia em DB_POOL_MAX", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_MAX: "" })

        expect(result.success).toBe(false)
    })

    it("rejeita zero em DB_POOL_MAX", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_MAX: "0" })

        expect(result.success).toBe(false)
    })

    it("rejeita negativo em DB_POOL_MAX", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_MAX: "-1" })

        expect(result.success).toBe(false)
    })

    it("rejeita não-inteiro em DB_POOL_MAX", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_MAX: "1.5" })

        expect(result.success).toBe(false)
    })

    it("aceita um inteiro positivo válido em DB_POOL_MAX", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_MAX: "20" })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DB_POOL_MAX).toBe(20)
        }
    })

    it("rejeita zero em DB_POOL_CONNECTION_TIMEOUT_MS", () => {
        const result = envSchema.safeParse({
            ...baseValidEnv,
            DB_POOL_CONNECTION_TIMEOUT_MS: "0",
        })

        expect(result.success).toBe(false)
    })

    it("rejeita negativo em DB_POOL_IDLE_TIMEOUT_MS", () => {
        const result = envSchema.safeParse({ ...baseValidEnv, DB_POOL_IDLE_TIMEOUT_MS: "-30000" })

        expect(result.success).toBe(false)
    })

    it("aplica os defaults documentados quando ausentes — max=10 é o comportamento real já observado, connectionTimeout=5000 e idleTimeout=30000 tornam explícito o que hoje é implícito no driver `pg`", () => {
        const result = envSchema.safeParse(baseValidEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.DB_POOL_MAX).toBe(10)
            expect(result.data.DB_POOL_CONNECTION_TIMEOUT_MS).toBe(5000)
            expect(result.data.DB_POOL_IDLE_TIMEOUT_MS).toBe(30000)
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
