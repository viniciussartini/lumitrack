import { describe, it, expect } from "vitest"
import { encryptMfaSecret, decryptMfaSecret } from "@/shared/crypto/mfaEncryption.js"

describe("encryptMfaSecret/decryptMfaSecret", () => {
    it("decryptMfaSecret(encryptMfaSecret(x)) retorna o valor original", () => {
        const secret = "GXUYE6S4PSBEY23XARHAUHJQSA7MRJS4"
        const encrypted = encryptMfaSecret(secret)

        expect(decryptMfaSecret(encrypted)).toBe(secret)
    })

    it("produz ciphertext diferente para o mesmo valor em chamadas distintas (IV aleatório)", () => {
        const secret = "JBSWY3DPEHPK3PXP"

        expect(encryptMfaSecret(secret)).not.toBe(encryptMfaSecret(secret))
    })

    it("o ciphertext não contém o valor original em texto claro", () => {
        const secret = "NB2HI4DTHIXS6Y3JNZ2GQYLZNRVHE"

        expect(encryptMfaSecret(secret)).not.toContain(secret)
    })

    it("lança erro ao tentar decifrar um valor corrompido (auth tag não confere)", () => {
        const encrypted = encryptMfaSecret("KRSXG5BAEBQWY3BAMVZGS3Q")
        const corrupted = encrypted.slice(0, -4) + "abcd"

        expect(() => decryptMfaSecret(corrupted)).toThrow()
    })
})
