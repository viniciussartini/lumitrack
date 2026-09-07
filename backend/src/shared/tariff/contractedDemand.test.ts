import { describe, it, expect } from "vitest"
import { resolveContractedDemands } from "@/shared/tariff/contractedDemand.js"
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
