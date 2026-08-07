import { describe, it, expect } from "vitest"
import { generateBlindIndex } from "@/shared/crypto/blindIndex.js"

describe("generateBlindIndex", () => {
    it("é determinístico — o mesmo valor sempre produz o mesmo índice", () => {
        const value = "529.982.247-25"

        expect(generateBlindIndex(value)).toBe(generateBlindIndex(value))
    })

    it("valores diferentes produzem índices diferentes", () => {
        expect(generateBlindIndex("529.982.247-25")).not.toBe(generateBlindIndex("310.037.856-38"))
    })

    it("retorna um hex de 64 caracteres (SHA-256)", () => {
        expect(generateBlindIndex("11.222.333/0001-81")).toMatch(/^[0-9a-f]{64}$/)
    })
})
