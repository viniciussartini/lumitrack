import { describe, it, expect } from "vitest"
import { resolveLogLevel, resolveTransport } from "@/shared/logger.js"

describe("resolveLogLevel", () => {
    it("silencia em test independente do LOG_LEVEL configurado", () => {
        expect(resolveLogLevel("test", "debug")).toBe("silent")
    })

    it("respeita o LOG_LEVEL configurado em development", () => {
        expect(resolveLogLevel("development", "debug")).toBe("debug")
    })

    it("respeita o LOG_LEVEL configurado em production", () => {
        expect(resolveLogLevel("production", "warn")).toBe("warn")
    })
})

describe("resolveTransport", () => {
    it("retorna undefined (JSON puro) em production", () => {
        expect(resolveTransport("production")).toBeUndefined()
    })

    it("retorna undefined em test (evita carregar pino-pretty sem necessidade)", () => {
        expect(resolveTransport("test")).toBeUndefined()
    })

    it("retorna config do pino-pretty em development", () => {
        const transport = resolveTransport("development")

        expect(transport?.target).toBe("pino-pretty")
    })
})
