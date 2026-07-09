import { describe, it, expect } from "vitest"
import { encryptAddress, decryptAddress } from "@/shared/crypto/addressEncryption.js"

describe("encryptAddress/decryptAddress", () => {
    it("decryptAddress(encryptAddress(x)) retorna o valor original", () => {
        const plaintext = "Rua das Flores, 123"

        expect(decryptAddress(encryptAddress(plaintext))).toBe(plaintext)
    })

    it("produz ciphertext diferente para o mesmo valor em chamadas distintas (IV aleatório)", () => {
        const plaintext = "Av. Paulista, 1000"

        expect(encryptAddress(plaintext)).not.toBe(encryptAddress(plaintext))
    })

    it("o ciphertext não contém o valor original em texto claro", () => {
        const plaintext = "Rua Consolação, 500"

        expect(encryptAddress(plaintext)).not.toContain(plaintext)
    })

    it("lança erro ao tentar decifrar um valor corrompido (auth tag não confere)", () => {
        const encrypted = encryptAddress("Rua XV de Novembro, 1")
        const corrupted = encrypted.slice(0, -4) + "abcd"

        expect(() => decryptAddress(corrupted)).toThrow()
    })

    it("funciona com todos os campos de endereço (city, state, zipCode)", () => {
        const cases = ["São Paulo", "SP", "01310-100"]

        for (const value of cases) {
            expect(decryptAddress(encryptAddress(value))).toBe(value)
        }
    })
})
