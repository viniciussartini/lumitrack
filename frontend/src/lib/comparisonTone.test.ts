import { describe, it, expect } from "vitest"
import { resolveDiffToneClass } from "@/lib/comparisonTone"

describe("resolveDiffToneClass", () => {
    it("verde quando a diferença é relevante e positiva", () => {
        expect(resolveDiffToneClass(41.23)).toBe("text-status-success")
    })

    it("vermelho quando a diferença é relevante e negativa", () => {
        expect(resolveDiffToneClass(-10.31)).toBe("text-status-danger")
    })

    it("neutro para diferença exatamente zero (ex.: mês abaixo do piso de disponibilidade)", () => {
        expect(resolveDiffToneClass(0)).toBe("text-muted")
    })

    it("neutro para um resíduo de ponto flutuante abaixo de meio centavo", () => {
        expect(resolveDiffToneClass(0.1 + 0.2 - 0.3)).toBe("text-muted")
        expect(resolveDiffToneClass(0.004)).toBe("text-muted")
        expect(resolveDiffToneClass(-0.004)).toBe("text-muted")
    })
})
