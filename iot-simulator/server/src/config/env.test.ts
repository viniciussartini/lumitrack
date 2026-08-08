import { describe, it, expect } from "vitest"
import { envSchema } from "@/config/env.js"

// Campos obrigatórios (sem default) — precisam estar presentes em todo
// safeParse que espera sucesso, senão o teste checaria só os defaults.
const requiredEnv = {
    SIMULATOR_API_TOKEN: "token-de-teste-com-mais-de-16-chars",
    BROKER_USERNAME: "sim-user",
    BROKER_PASSWORD: "sim-pass",
}

describe("envSchema", () => {
    it("aplica defaults quando só os campos obrigatórios são fornecidos", () => {
        const result = envSchema.safeParse(requiredEnv)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual({
                NODE_ENV: "development",
                BROKER_PORT: 1883,
                BROKER_HOST: "127.0.0.1",
                API_PORT: 4100,
                API_HOST: "127.0.0.1",
                CORS_ORIGIN: "http://localhost:5180",
                LOG_LEVEL: "info",
                ...requiredEnv,
            })
        }
    })

    it("coage BROKER_PORT e API_PORT de string (process.env) para number", () => {
        const result = envSchema.safeParse({
            ...requiredEnv,
            BROKER_PORT: "1884",
            API_PORT: "4101",
        })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.BROKER_PORT).toBe(1884)
            expect(result.data.API_PORT).toBe(4101)
        }
    })

    it("rejeita LOG_LEVEL fora do enum aceito", () => {
        const result = envSchema.safeParse({ ...requiredEnv, LOG_LEVEL: "verbose" })

        expect(result.success).toBe(false)
    })

    it("rejeita NODE_ENV fora do enum aceito", () => {
        const result = envSchema.safeParse({ ...requiredEnv, NODE_ENV: "staging" })

        expect(result.success).toBe(false)
    })

    it("falha sem SIMULATOR_API_TOKEN", () => {
        const { SIMULATOR_API_TOKEN: _omit, ...rest } = requiredEnv
        const result = envSchema.safeParse(rest)

        expect(result.success).toBe(false)
    })

    it("falha com SIMULATOR_API_TOKEN curto demais", () => {
        const result = envSchema.safeParse({ ...requiredEnv, SIMULATOR_API_TOKEN: "curto" })

        expect(result.success).toBe(false)
    })

    it("falha sem BROKER_USERNAME", () => {
        const { BROKER_USERNAME: _omit, ...rest } = requiredEnv
        const result = envSchema.safeParse(rest)

        expect(result.success).toBe(false)
    })

    it("falha sem BROKER_PASSWORD", () => {
        const { BROKER_PASSWORD: _omit, ...rest } = requiredEnv
        const result = envSchema.safeParse(rest)

        expect(result.success).toBe(false)
    })
})
