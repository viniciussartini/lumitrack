import { describe, it, expect } from "vitest"
import {
    measuredDemandKwFor,
    measuredDemandKwOrNull,
    resolveContractedDemands,
} from "@/shared/tariff/contractedDemand.js"
import type { MeterDemandRollupResponse } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"

const basePropertyFields = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Frigorífico",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "TRIPHASIC",
    tariffGroup: "GROUP_A",
    billingClass: null,
    tariffSubgroup: "A4",
    createdAt: new Date(),
    updatedAt: new Date(),
} as const

const buildProperty = (overrides: Partial<PropertyResponse>): PropertyResponse =>
    ({
        ...basePropertyFields,
        tariffModality: null,
        contractedDemandKw: null,
        contractedDemandPeakKw: null,
        contractedDemandOffPeakKw: null,
        publicLightingFeeBrl: null,
        ...overrides,
    }) as PropertyResponse

describe("resolveContractedDemands", () => {
    describe("GREEN", () => {
        it("devolve 1 entrada com post null a partir de contractedDemandKw", () => {
            const property = buildProperty({ tariffModality: "GREEN", contractedDemandKw: 200 })

            expect(resolveContractedDemands(property, "GREEN")).toEqual([
                { post: null, contractedDemandKw: 200 },
            ])
        })

        it("falha fechado quando contractedDemandKw não está cadastrado", () => {
            const property = buildProperty({ tariffModality: "GREEN" })

            expect(() => resolveContractedDemands(property, "GREEN")).toThrow(
                /sem demanda contratada cadastrada/i,
            )
        })
    })

    describe("BLUE", () => {
        it("devolve 2 entradas (PEAK/OFF_PEAK) a partir das duas demandas contratadas", () => {
            const property = buildProperty({
                tariffModality: "BLUE",
                contractedDemandPeakKw: 150,
                contractedDemandOffPeakKw: 400,
            })

            expect(resolveContractedDemands(property, "BLUE")).toEqual([
                { post: "PEAK", contractedDemandKw: 150 },
                { post: "OFF_PEAK", contractedDemandKw: 400 },
            ])
        })

        it("falha fechado quando falta a demanda de ponta", () => {
            const property = buildProperty({
                tariffModality: "BLUE",
                contractedDemandOffPeakKw: 400,
            })

            expect(() => resolveContractedDemands(property, "BLUE")).toThrow(
                /Azul sem as duas demandas contratadas/i,
            )
        })

        it("falha fechado quando falta a demanda fora de ponta", () => {
            const property = buildProperty({
                tariffModality: "BLUE",
                contractedDemandPeakKw: 150,
            })

            expect(() => resolveContractedDemands(property, "BLUE")).toThrow(
                /Azul sem as duas demandas contratadas/i,
            )
        })
    })
})

const rollup = (
    post: MeterDemandRollupResponse["post"],
    maxAvgPowerW: number,
): MeterDemandRollupResponse => ({
    meterId: "meter-1",
    periodStart: new Date("2026-10-01T03:00:00Z"),
    post,
    maxAvgPowerW,
    windowEndAt: new Date("2026-10-10T20:00:00Z"),
})

describe("measuredDemandKwOrNull", () => {
    it("Verde (post null) usa o maior valor entre os postos, em kW", () => {
        const rows = [rollup("PEAK", 120_000), rollup("OFF_PEAK", 95_000)]

        expect(measuredDemandKwOrNull(null, rows)).toBe(120)
    })

    it("Azul compara cada posto só com a medição do mesmo posto", () => {
        const rows = [rollup("PEAK", 120_000), rollup("OFF_PEAK", 95_000)]

        expect(measuredDemandKwOrNull("PEAK", rows)).toBe(120)
        expect(measuredDemandKwOrNull("OFF_PEAK", rows)).toBe(95)
    })

    it("sem janela medida é ausência, nunca 0 kW", () => {
        expect(measuredDemandKwOrNull(null, [])).toBeNull()
        expect(measuredDemandKwOrNull("PEAK", [rollup("OFF_PEAK", 95_000)])).toBeNull()
    })
})

describe("measuredDemandKwFor", () => {
    it("segue devolvendo 0 sem janela medida: o custo e o alerta não geram ultrapassagem por ausência", () => {
        expect(measuredDemandKwFor(null, [])).toBe(0)
        expect(measuredDemandKwFor("PEAK", [rollup("OFF_PEAK", 95_000)])).toBe(0)
    })

    it("com janela medida devolve o mesmo valor da base", () => {
        expect(measuredDemandKwFor("OFF_PEAK", [rollup("OFF_PEAK", 95_000)])).toBe(95)
    })
})
