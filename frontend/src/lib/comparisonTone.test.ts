import { describe, it, expect } from "vitest"
import {
    PERIOD_VARIATION_TOLERANCE_PERCENT,
    resolveDiffToneClass,
    resolvePeriodVariationToneClass,
} from "@/lib/comparisonTone"

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

describe("resolvePeriodVariationToneClass", () => {
    it("vermelho quando B fica acima de A além da tolerância", () => {
        expect(resolvePeriodVariationToneClass(12.5)).toBe("text-status-danger")
    })

    it("verde quando B fica abaixo de A além da tolerância", () => {
        expect(resolvePeriodVariationToneClass(-12.5)).toBe("text-status-success")
    })

    it(`neutro dentro de ±${PERIOD_VARIATION_TOLERANCE_PERCENT}%, incluindo o limite exato`, () => {
        expect(resolvePeriodVariationToneClass(0)).toBe("text-muted")
        expect(resolvePeriodVariationToneClass(0.4)).toBe("text-muted")
        expect(resolvePeriodVariationToneClass(-0.4)).toBe("text-muted")
        expect(resolvePeriodVariationToneClass(PERIOD_VARIATION_TOLERANCE_PERCENT)).toBe(
            "text-muted",
        )
        expect(resolvePeriodVariationToneClass(-PERIOD_VARIATION_TOLERANCE_PERCENT)).toBe(
            "text-muted",
        )
    })

    it("sem percentual calculável, neutro", () => {
        expect(resolvePeriodVariationToneClass(null)).toBe("text-muted")
    })
})
