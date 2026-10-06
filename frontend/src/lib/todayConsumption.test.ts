import { describe, expect, it } from "vitest"
import {
    SUMMARY_MAX_IDS,
    chunkIds,
    collectTargetIds,
    formatTodayCost,
    formatTodayKwh,
} from "@/lib/todayConsumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { PropertyTreeNode } from "@/types/property.types"

const property: PropertyTreeNode = {
    id: "prop-1",
    name: "Casa",
    tariffGroup: "GROUP_B",
    areas: [
        {
            id: "area-1",
            name: "Cozinha",
            devices: [
                { id: "dev-1", name: "Geladeira", powerWatts: 150 },
                { id: "dev-2", name: "Forno", powerWatts: 1800 },
            ],
        },
        { id: "area-2", name: "Sala", devices: [{ id: "dev-3", name: "TV", powerWatts: 90 }] },
    ],
}

const item = (kwhConsumed: number, costBrl?: number): ConsumptionSummaryItem => ({
    id: "x",
    targetType: "PROPERTY",
    bucketStart: "2026-10-05T00:00:00.000Z",
    kwhConsumed,
    avgPowerW: 0,
    ...(costBrl !== undefined && { costBrl }),
})

describe("collectTargetIds", () => {
    it("separa os ids por tipo de alvo, que é como o resumo os aceita", () => {
        expect(collectTargetIds(property)).toEqual({
            PROPERTY: ["prop-1"],
            AREA: ["area-1", "area-2"],
            DEVICE: ["dev-1", "dev-2", "dev-3"],
        })
    })

    it("propriedade sem áreas só consulta a própria propriedade", () => {
        expect(collectTargetIds({ ...property, areas: [] })).toEqual({
            PROPERTY: ["prop-1"],
            AREA: [],
            DEVICE: [],
        })
    })
})

describe("chunkIds", () => {
    it("o teto do resumo é de 50 ids por pedido", () => {
        expect(SUMMARY_MAX_IDS).toBe(50)
    })

    it("até o teto é um pedido só", () => {
        const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`)

        expect(chunkIds(ids, SUMMARY_MAX_IDS)).toEqual([ids])
    })

    it("passou do teto, abre um pedido a mais, sem perder nem repetir id", () => {
        const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`)

        const chunks = chunkIds(ids, SUMMARY_MAX_IDS)

        expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 1])
        expect(chunks.flat()).toEqual(ids)
    })

    it("sem ids não há pedido", () => {
        expect(chunkIds([], SUMMARY_MAX_IDS)).toEqual([])
    })
})

describe("formatTodayKwh", () => {
    it("formata o consumo do dia em kWh", () => {
        expect(formatTodayKwh(item(12.5))).toBe("12,50 kWh")
    })

    it("sem item (sem medidor ou sem leitura hoje) é '-', nunca 0 kWh", () => {
        expect(formatTodayKwh(undefined)).toBe("-")
    })

    it("consumo zero com leitura é um consumo de verdade", () => {
        expect(formatTodayKwh(item(0))).toBe("0,00 kWh")
    })
})

describe("formatTodayCost", () => {
    it("formata o custo do dia em reais", () => {
        expect(formatTodayCost(item(10, 8.4)).replace(/\s/g, " ")).toBe("R$ 8,40")
    })

    it("custo não calculável (Grupo A, Tarifa Branca em área e dispositivo) é '-'", () => {
        expect(formatTodayCost(item(10))).toBe("-")
    })

    it("sem item também é '-'", () => {
        expect(formatTodayCost(undefined)).toBe("-")
    })
})
