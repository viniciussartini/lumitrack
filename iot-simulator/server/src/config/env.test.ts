import { describe, it, expect } from "vitest"
import { envSchema } from "@/config/env.js"

describe("envSchema", () => {
    it("aplica defaults quando nenhuma variável é fornecida", () => {
        const result = envSchema.safeParse({})

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual({
                NODE_ENV: "development",
                BROKER_PORT: 1883,
                API_PORT: 4100,
                CORS_ORIGIN: "http://localhost:5180",
                LOG_LEVEL: "info",
            })
        }
    })

    it("coage BROKER_PORT e API_PORT de string (process.env) para number", () => {
        const result = envSchema.safeParse({ BROKER_PORT: "1884", API_PORT: "4101" })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.BROKER_PORT).toBe(1884)
            expect(result.data.API_PORT).toBe(4101)
        }
    })

    it("rejeita LOG_LEVEL fora do enum aceito", () => {
        const result = envSchema.safeParse({ LOG_LEVEL: "verbose" })

        expect(result.success).toBe(false)
    })

    it("rejeita NODE_ENV fora do enum aceito", () => {
        const result = envSchema.safeParse({ NODE_ENV: "staging" })

        expect(result.success).toBe(false)
    })
})
