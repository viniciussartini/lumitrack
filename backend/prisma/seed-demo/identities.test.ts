import { describe, it, expect } from "vitest"
import { generateCpf, generateCnpj, DEMO_CPF, DEMO_CNPJ } from "./identities.js"

// Reimplementação independente de isValidCpf/isValidCnpj
// (backend/src/modules/user/user.schema.ts, funções privadas do módulo) —
// mesmo padrão usado em iot-simulator/server para validar payloads contra
// o predicado real do backend sem importar código privado.
function isValidCpf(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, "")
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number): number => {
        let sum = 0
        for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i)
        const rem = (sum * 10) % 11
        return rem >= 10 ? 0 : rem
    }

    return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10])
}

function isValidCnpj(cnpj: string): boolean {
    const digits = cnpj.replace(/\D/g, "")
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number): number => {
        let pos = len - 7
        let sum = 0
        for (let i = len; i >= 1; i--) {
            sum += Number(digits[len - i]) * pos
            pos--
            if (pos < 2) pos = 9
        }
        const rem = sum % 11
        return rem < 2 ? 0 : 11 - rem
    }

    return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13])
}

describe("generateCpf", () => {
    it("gera um CPF com dígitos verificadores matematicamente válidos", () => {
        expect(isValidCpf(generateCpf([5, 2, 4, 1, 3, 7, 8, 9, 6]))).toBe(true)
    })

    it("DEMO_CPF (usado no seed) é válido", () => {
        expect(isValidCpf(DEMO_CPF)).toBe(true)
    })

    it("formata como 000.000.000-00", () => {
        expect(generateCpf([5, 2, 4, 1, 3, 7, 8, 9, 6])).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
    })

    it("gera CPFs válidos para múltiplas bases diferentes", () => {
        const bases = [
            [1, 2, 3, 4, 5, 6, 7, 8, 0],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
            [0, 1, 1, 2, 2, 3, 3, 4, 4],
        ]
        for (const base of bases) {
            expect(isValidCpf(generateCpf(base))).toBe(true)
        }
    })
})

describe("generateCnpj", () => {
    it("gera um CNPJ com dígitos verificadores matematicamente válidos", () => {
        expect(isValidCnpj(generateCnpj([1, 9, 8, 4, 5, 2, 7, 3, 0, 0, 0, 1]))).toBe(true)
    })

    it("DEMO_CNPJ (usado no seed) é válido", () => {
        expect(isValidCnpj(DEMO_CNPJ)).toBe(true)
    })

    it("formata como 00.000.000/0000-00", () => {
        expect(generateCnpj([1, 9, 8, 4, 5, 2, 7, 3, 0, 0, 0, 1])).toMatch(
            /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
        )
    })

    it("gera CNPJs válidos para múltiplas bases diferentes", () => {
        const bases = [
            [1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 1],
            [9, 8, 7, 6, 5, 4, 3, 2, 0, 0, 0, 1],
        ]
        for (const base of bases) {
            expect(isValidCnpj(generateCnpj(base))).toBe(true)
        }
    })
})
