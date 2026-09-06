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

    describe("calculateForGroupA", () => {
        // Exemplo 6 do documento de referência — metalúrgica A4 Verde em
        // Joinville/SC (Celesc): 200 kW contratados, consumo 800 kWh Ponta +
        // 28.000 kWh Fora de Ponta, ICMS SC 17%, bandeira amarela, CIP
        // R$ 250,00. O documento publica R$ 22.464,75, mas refazendo a
        // divisão "por dentro" com precisão total (16.382,88 / 0,7375) o
        // valor correto é R$ 22.464,07 — a diferença de R$ 0,68 é um
        // arredondamento manual do próprio documento, não um erro desta
        // fórmula (subtotal antes dos tributos bate exatamente: demanda
        // R$ 3.600,00 + energia R$ 12.240,00 + bandeira R$ 542,88 =
        // R$ 16.382,88, igual ao documento). Oráculo ajustado ao valor
        // matematicamente correto.
        it("reproduz o Exemplo 6 do documento de referência (A4 Verde)", () => {
            const result = service.calculateForGroupA({
                contractedDemandKw: 200,
                tusdPerKw: 18.0,
                energyByPost: [
                    { post: "PEAK", kwhConsumed: 800, tusdPerKwh: 0.75, tePerKwh: 0.55 },
                    { post: "OFF_PEAK", kwhConsumed: 28_000, tusdPerKwh: 0.12, tePerKwh: 0.28 },
                ],
                icmsRate: 0.17,
                pisRate: 0.0165,
                cofinsRate: 0.076,
                flagPer100Kwh: 1.885,
                publicLightingFeeBrl: 250,
            })

            expect(result.demandBrl).toBeCloseTo(3600, 2)
            expect(result.energyBrl).toBeCloseTo(12_240, 2)
            expect(result.flagBrl).toBeCloseTo(542.88, 2)
            expect(result.publicLightingFeeBrl).toBe(250)
            expect(result.totalBrl).toBeCloseTo(22_464.07, 2)
        })

        it("bandeira incide só sobre o consumo total, nunca sobre a demanda (RN22)", () => {
            const withZeroConsumption = service.calculateForGroupA({
                contractedDemandKw: 100,
                tusdPerKw: 18.0,
                energyByPost: [
                    { post: "OFF_PEAK", kwhConsumed: 0, tusdPerKwh: 0.12, tePerKwh: 0.28 },
                ],
                icmsRate: 0.18,
                pisRate: 0.0165,
                cofinsRate: 0.076,
                flagPer100Kwh: 1.885,
                publicLightingFeeBrl: null,
            })

            expect(withZeroConsumption.flagBrl).toBe(0)
            expect(withZeroConsumption.demandBrl).toBeCloseTo(1800, 2) // demanda cobrada mesmo sem consumo
        })

        it("CIP nulo vira zero, sem quebrar o total", () => {
            const result = service.calculateForGroupA({
                contractedDemandKw: 50,
                tusdPerKw: 18.0,
                energyByPost: [
                    { post: "OFF_PEAK", kwhConsumed: 1000, tusdPerKwh: 0.4, tePerKwh: 0 },
                ],
                icmsRate: 0.18,
                pisRate: 0.0165,
                cofinsRate: 0.076,
                flagPer100Kwh: 0,
                publicLightingFeeBrl: null,
            })

            expect(result.publicLightingFeeBrl).toBe(0)
        })
    })
})
