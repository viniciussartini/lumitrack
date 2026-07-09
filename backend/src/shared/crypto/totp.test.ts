import { describe, it, expect } from "vitest"
import { generate } from "otplib"
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from "@/shared/crypto/totp.js"

describe("generateTotpSecret", () => {
    it("gera secrets diferentes a cada chamada", () => {
        expect(generateTotpSecret()).not.toBe(generateTotpSecret())
    })
})

describe("generateTotpUri", () => {
    it("gera uma URI otpauth://totp com issuer e e-mail corretos", () => {
        const uri = generateTotpUri("joao@example.com", "JBSWY3DPEHPK3PXP")

        expect(uri).toMatch(/^otpauth:\/\/totp\//)
        expect(uri).toContain("issuer=LumiTrack")
        expect(uri).toContain(encodeURIComponent("joao@example.com").replace(/%40/g, "%40"))
    })
})

describe("verifyTotpCode", () => {
    it("aceita um código válido gerado para o secret", async () => {
        const secret = generateTotpSecret()
        const code = await generate({ secret })

        expect(await verifyTotpCode(secret, code)).toBe(true)
    })

    it("rejeita um código incorreto", async () => {
        const secret = generateTotpSecret()

        expect(await verifyTotpCode(secret, "000000")).toBe(false)
    })

    it("rejeita um código de formato inválido sem lançar exceção", async () => {
        const secret = generateTotpSecret()

        expect(await verifyTotpCode(secret, "abc")).toBe(false)
    })

    it("rejeita um código válido para um secret diferente", async () => {
        const secretA = generateTotpSecret()
        const secretB = generateTotpSecret()
        const codeForA = await generate({ secret: secretA })

        expect(await verifyTotpCode(secretB, codeForA)).toBe(false)
    })
})
