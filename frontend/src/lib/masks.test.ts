import { describe, it, expect } from "vitest"
import { formatCpf, formatCnpj } from "@/lib/masks"

describe("formatCpf", () => {
    it("formata progressivamente conforme digita", () => {
        expect(formatCpf("123")).toBe("123")
        expect(formatCpf("1234")).toBe("123.4")
        expect(formatCpf("123456")).toBe("123.456")
        expect(formatCpf("1234567")).toBe("123.456.7")
        expect(formatCpf("123456789")).toBe("123.456.789")
        expect(formatCpf("1234567890")).toBe("123.456.789-0")
        expect(formatCpf("12345678909")).toBe("123.456.789-09")
    })

    it("é idempotente — input já formatado retorna inalterado", () => {
        expect(formatCpf("123.456.789-09")).toBe("123.456.789-09")
    })

    it("ignora caracteres não-numéricos", () => {
        expect(formatCpf("123abc456def")).toBe("123.456")
        expect(formatCpf("***123***")).toBe("123")
    })

    it("trunca em 11 dígitos", () => {
        expect(formatCpf("12345678909999")).toBe("123.456.789-09")
    })

    it("retorna string vazia quando input é vazio", () => {
        expect(formatCpf("")).toBe("")
    })
})

describe("formatCnpj", () => {
    it("formata progressivamente conforme digita", () => {
        expect(formatCnpj("11")).toBe("11")
        expect(formatCnpj("112")).toBe("11.2")
        expect(formatCnpj("11222")).toBe("11.222")
        expect(formatCnpj("112223")).toBe("11.222.3")
        expect(formatCnpj("11222333")).toBe("11.222.333")
        expect(formatCnpj("112223330")).toBe("11.222.333/0")
        expect(formatCnpj("11222333000")).toBe("11.222.333/000")
        expect(formatCnpj("112223330001")).toBe("11.222.333/0001")
        expect(formatCnpj("1122233300018")).toBe("11.222.333/0001-8")
        expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81")
    })

    it("é idempotente", () => {
        expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81")
    })

    it("ignora caracteres não-numéricos", () => {
        expect(formatCnpj("11abc222def")).toBe("11.222")
    })

    it("trunca em 14 dígitos", () => {
        expect(formatCnpj("11222333000181999")).toBe("11.222.333/0001-81")
    })
})