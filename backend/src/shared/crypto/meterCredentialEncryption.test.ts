import { describe, it, expect } from "vitest"
import {
    encryptMeterCredential,
    decryptMeterCredential,
} from "@/shared/crypto/meterCredentialEncryption.js"

describe("encryptMeterCredential/decryptMeterCredential", () => {
    it("decryptMeterCredential(encryptMeterCredential(x)) retorna o valor original", () => {
        const plaintext = "senha-mqtt-super-secreta"

        expect(decryptMeterCredential(encryptMeterCredential(plaintext))).toBe(plaintext)
    })

    it("produz ciphertext diferente para o mesmo valor em chamadas distintas (IV aleatório)", () => {
        const plaintext = "senha-mqtt-super-secreta"

        expect(encryptMeterCredential(plaintext)).not.toBe(encryptMeterCredential(plaintext))
    })

    it("o ciphertext não contém o valor original em texto claro", () => {
        const plaintext = "senha-mqtt-super-secreta"

        expect(encryptMeterCredential(plaintext)).not.toContain(plaintext)
    })

    it("lança erro ao tentar decifrar um valor corrompido (auth tag não confere)", () => {
        const encrypted = encryptMeterCredential("senha-mqtt-super-secreta")
        const corrupted = encrypted.slice(0, -4) + "abcd"

        expect(() => decryptMeterCredential(corrupted)).toThrow()
    })
})
