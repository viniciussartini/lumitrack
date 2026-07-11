import { describe, it, expect } from "vitest"
import { TariffService } from "@/shared/tariff/tariff.service.js"

const service = new TariffService()

// Alíquotas nominais ~27,25% (18% ICMS + 1,65% PIS + 7,6% COFINS) — mesma
// composição usada no seed para SP/MG/PR etc.
const BASE_RATES = {
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
}

describe("TariffService", () => {
    describe("calculateForProperty", () => {
        it("aplica o piso de disponibilidade quando o consumo fica abaixo dele (monofásico, 30 kWh)", () => {
            const result = service.calculateForProperty({
                kwhConsumed: 10,
                electricalSystem: "MONOPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(result.kwhBilled).toBe(30)
        })

        it("usa o consumo real quando ele supera o piso", () => {
            const result = service.calculateForProperty({
                kwhConsumed: 500,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(result.kwhBilled).toBe(500)
        })

        it("bandeira verde (0 R$/100kWh) não adiciona custo de bandeira", () => {
            const result = service.calculateForProperty({
                kwhConsumed: 100,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(result.flagBrl).toBe(0)
        })

        it("calcula o total com tributos 'por dentro' (~27,25%)", () => {
            // energia = 100 * 0.6 = 60; sem bandeira; total = 60 / (1 - 0.2725)
            const result = service.calculateForProperty({
                kwhConsumed: 100,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            const expectedTotal = 60 / (1 - 0.2725)
            expect(result.totalBrl).toBeCloseTo(expectedTotal, 6)
            expect(result.taxesBrl).toBeCloseTo(expectedTotal - 60, 6)
        })

        it("soma a CIP fora da base de tributos", () => {
            const withoutCip = service.calculateForProperty({
                kwhConsumed: 100,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            const withCip = service.calculateForProperty({
                kwhConsumed: 100,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: 30,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(withCip.publicLightingFeeBrl).toBe(30)
            expect(withCip.totalBrl).toBeCloseTo(withoutCip.totalBrl + 30, 6)
        })

        it("aplica o acréscimo de bandeira vermelha P2 (R$7,877/100kWh)", () => {
            const result = service.calculateForProperty({
                kwhConsumed: 100,
                electricalSystem: "TRIPHASIC",
                publicLightingFeeBrl: null,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 7.877,
            })

            expect(result.flagBrl).toBeCloseTo(7.877, 6)
        })
    })

    describe("calculateForSubTarget", () => {
        it("não aplica piso de disponibilidade", () => {
            const result = service.calculateForSubTarget({
                kwhConsumed: 1,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(result.kwhBilled).toBe(1)
        })

        it("não soma CIP", () => {
            const result = service.calculateForSubTarget({
                kwhConsumed: 100,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            expect(result.publicLightingFeeBrl).toBe(0)
        })

        it("calcula energia + tributos 'por dentro' sobre o consumo real", () => {
            const result = service.calculateForSubTarget({
                kwhConsumed: 50,
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                ...BASE_RATES,
                flagPer100Kwh: 0,
            })

            const expectedTotal = 30 / (1 - 0.2725)
            expect(result.totalBrl).toBeCloseTo(expectedTotal, 6)
        })
    })
})
