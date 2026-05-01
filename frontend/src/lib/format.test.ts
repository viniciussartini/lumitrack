import { describe, it, expect } from "vitest"
import {
    formatBrl,
    formatPercent,
    formatVoltage,
    formatKwhPrice,
    truncate,
} from "@/lib/format"

describe("formatBrl", () => {
    it("formata número como BRL com prefixo R$", () => {
        // \u00a0 é o NBSP que o Intl insere entre R$ e o número.
        // Usar regex para tolerar espaço comum vs NBSP entre runtimes.
        expect(formatBrl(1234.5)).toMatch(/^R\$\s?1\.234,50$/)
    })

    it("formata zero", () => {
        expect(formatBrl(0)).toMatch(/^R\$\s?0,00$/)
    })

    it("retorna travessão para null/undefined", () => {
        expect(formatBrl(null)).toBe("—")
        expect(formatBrl(undefined)).toBe("—")
    })

    it("formata valores pequenos com 2 casas decimais", () => {
        expect(formatBrl(0.75)).toMatch(/^R\$\s?0,75$/)
    })
})

describe("formatPercent", () => {
    it("formata decimal 0.12 como 12%", () => {
        expect(formatPercent(0.12)).toBe("12%")
    })

    it("formata fracionário com vírgula decimal", () => {
        expect(formatPercent(0.125)).toBe("12,5%")
    })

    it("retorna travessão para null/undefined", () => {
        expect(formatPercent(null)).toBe("—")
        expect(formatPercent(undefined)).toBe("—")
    })

    it("formata zero", () => {
        expect(formatPercent(0)).toBe("0%")
    })
})

describe("formatVoltage", () => {
    it("adiciona sufixo V", () => {
        expect(formatVoltage(220)).toBe("220 V")
        expect(formatVoltage(13800)).toBe("13800 V")
    })
})

describe("formatKwhPrice", () => {
    it("compõe formato BRL com sufixo /kWh", () => {
        expect(formatKwhPrice(0.75)).toMatch(/^R\$\s?0,75\/kWh$/)
    })
})

describe("truncate", () => {
    it("retorna a string inalterada quando dentro do limite", () => {
        expect(truncate("Curto", 10)).toBe("Curto")
    })

    it("trunca e adiciona elipse quando excede o limite", () => {
        expect(truncate("Texto muito longo", 10)).toBe("Texto muit…")
    })

    it("respeita exatamente o tamanho do limite", () => {
        expect(truncate("1234567890", 10)).toBe("1234567890")
    })
})