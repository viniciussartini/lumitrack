import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { passwordSchema } from "@/shared/validation/passwordSchema.js"

const ENV_KEY = "DEMO_SEED_PASSWORD"
const originalValue = process.env[ENV_KEY]

beforeEach(() => {
    vi.resetModules()
    delete process.env[ENV_KEY]
})

afterEach(() => {
    if (originalValue === undefined) {
        delete process.env[ENV_KEY]
    } else {
        process.env[ENV_KEY] = originalValue
    }
})

describe("DEMO_PASSWORD (seed de demonstração)", () => {
    it("nunca é o valor fixo antigo, versionado em git antes desta correção", async () => {
        const { DEMO_PASSWORD } = await import("./constants.js")
        expect(DEMO_PASSWORD).not.toBe("DemoLumi@2026")
    })

    it("usa DEMO_SEED_PASSWORD quando definida", async () => {
        process.env[ENV_KEY] = "Senha@Escolhida123"
        const { DEMO_PASSWORD } = await import("./constants.js")
        expect(DEMO_PASSWORD).toBe("Senha@Escolhida123")
    })

    it("gera uma senha aleatória válida quando DEMO_SEED_PASSWORD está ausente", async () => {
        const { DEMO_PASSWORD } = await import("./constants.js")
        expect(() => passwordSchema.parse(DEMO_PASSWORD)).not.toThrow()
    })

    it("gera uma senha aleatória válida quando DEMO_SEED_PASSWORD está definida como string vazia (.env com a chave sem valor)", async () => {
        process.env[ENV_KEY] = ""
        const { DEMO_PASSWORD } = await import("./constants.js")
        expect(() => passwordSchema.parse(DEMO_PASSWORD)).not.toThrow()
    })

    it("gera uma senha diferente a cada execução sem DEMO_SEED_PASSWORD (não é um fallback fixo disfarçado)", async () => {
        const first = await import("./constants.js")
        vi.resetModules()
        const second = await import("./constants.js")
        expect(first.DEMO_PASSWORD).not.toBe(second.DEMO_PASSWORD)
    })
})
