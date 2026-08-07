import { describe, it, expect } from "vitest"
import { formatCpf, formatCnpj, formatCep, maskCpf, maskCnpj } from "@/lib/masks"

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

describe("maskCpf", () => {
    it("mascara os dois primeiros blocos, preservando o último e o dígito verificador", () => {
        expect(maskCpf("123.456.789-09")).toBe("•••.•••.789-09")
    })
})

describe("maskCnpj", () => {
    it("mascara os três primeiros blocos, preservando a filial e o dígito verificador", () => {
        expect(maskCnpj("11.222.333/0001-81")).toBe("••.•••.•••/0001-81")
    })
})

describe("formatCep", () => {
    it("formata progressivamente conforme digita", () => {
        expect(formatCep("3")).toBe("3")
        expect(formatCep("30")).toBe("30")
        expect(formatCep("30000")).toBe("30000")
        expect(formatCep("300000")).toBe("30000-0")
        expect(formatCep("3000000")).toBe("30000-00")
        expect(formatCep("30000000")).toBe("30000-000")
    })

    it("é idempotente — input já formatado retorna inalterado", () => {
        expect(formatCep("30000-000")).toBe("30000-000")
    })

    it("ignora caracteres não-numéricos", () => {
        expect(formatCep("30abc000")).toBe("30000")
        expect(formatCep("***30000***000")).toBe("30000-000")
    })

    it("trunca em 8 dígitos", () => {
        expect(formatCep("30000000999")).toBe("30000-000")
    })

    it("retorna string vazia quando input é vazio", () => {
        expect(formatCep("")).toBe("")
    })
})
