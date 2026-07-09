import { describe, it, expect } from "vitest"
import { encrypt, decrypt } from "@/shared/crypto/encryption.js"

describe("encrypt/decrypt", () => {
    it("decrypt(encrypt(x)) retorna o valor original", () => {
        const plaintext = "529.982.247-25"
        const encrypted = encrypt(plaintext)

        expect(decrypt(encrypted)).toBe(plaintext)
    })

    it("produz ciphertext diferente para o mesmo valor em chamadas distintas (IV aleatório)", () => {
        const plaintext = "11.222.333/0001-81"

        expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
    })

    it("o ciphertext não contém o valor original em texto claro", () => {
        const plaintext = "310.037.856-38"

        expect(encrypt(plaintext)).not.toContain(plaintext)
    })

    it("lança erro ao tentar decifrar um valor corrompido (auth tag não confere)", () => {
        const encrypted = encrypt("06.981.180/0001-16")
        const corrupted = encrypted.slice(0, -4) + "abcd"

        expect(() => decrypt(corrupted)).toThrow()
    })

    it("funciona com CNPJ (string mais longa que CPF)", () => {
        const plaintext = "02.429.144/0001-93"

        expect(decrypt(encrypt(plaintext))).toBe(plaintext)
    })
})
