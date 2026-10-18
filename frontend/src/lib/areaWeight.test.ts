import { describe, expect, it } from "vitest"
import {
    buildAreaWeightEntries,
    chartCategoryColor,
    computeAreaWeights,
    formatWeightPercent,
} from "@/lib/areaWeight"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { AreaTreeNode } from "@/types/property.types"

const area = (id: string, name: string): AreaTreeNode => ({ id, name, devices: [] })

const item = (id: string, kwhConsumed: number): ConsumptionSummaryItem => ({
    id,
    targetType: "AREA",
    bucketStart: "2026-10-01T00:00:00.000Z",
    kwhConsumed,
    avgPowerW: 0,
})

const byId = (items: ConsumptionSummaryItem[]) => new Map(items.map((entry) => [entry.id, entry]))

describe("chartCategoryColor", () => {
    it("usa os tokens da paleta, em ordem", () => {
        expect(chartCategoryColor(0)).toBe("var(--color-chart-cat-1)")
        expect(chartCategoryColor(15)).toBe("var(--color-chart-cat-16)")
    })

    it("passando de 16 séries a paleta recomeça", () => {
        expect(chartCategoryColor(16)).toBe("var(--color-chart-cat-1)")
        expect(chartCategoryColor(19)).toBe("var(--color-chart-cat-4)")
    })
})

describe("buildAreaWeightEntries", () => {
    const areas = [area("a1", "Cozinha"), area("a2", "Sala"), area("a3", "Garagem")]

    it("só entram as áreas com medidor e consumo no mês, na ordem da hierarquia", () => {
        const entries = buildAreaWeightEntries(areas, byId([item("a3", 4), item("a1", 6)]))

        expect(entries.map((entry) => [entry.id, entry.name, entry.kwh])).toEqual([
            ["a1", "Cozinha", 6],
            ["a3", "Garagem", 4],
        ])
    })

    it("a cor é da posição na lista de áreas com medidor, e não muda ao marcar e desmarcar", () => {
        const entries = buildAreaWeightEntries(areas, byId([item("a1", 6), item("a3", 4)]))

        expect(entries.map((entry) => entry.color)).toEqual([
            "var(--color-chart-cat-1)",
            "var(--color-chart-cat-2)",
        ])
    })

    it("sem nenhuma área com medidor a lista é vazia", () => {
        expect(buildAreaWeightEntries(areas, byId([]))).toEqual([])
    })

    it("área com leitura e consumo zero continua na lista: é um medidor de verdade", () => {
        const entries = buildAreaWeightEntries(areas, byId([item("a2", 0)]))

        expect(entries.map((entry) => entry.id)).toEqual(["a2"])
    })
})

describe("computeAreaWeights", () => {
    const entries = buildAreaWeightEntries(
        [area("a1", "Cozinha"), area("a2", "Sala"), area("a3", "Garagem")],
        byId([item("a1", 50), item("a2", 30), item("a3", 20)]),
    )

    it("o percentual é sobre o total das áreas selecionadas", () => {
        const weights = computeAreaWeights(entries, new Set())

        expect(weights.totalKwh).toBe(100)
        expect(weights.slices.map((slice) => slice.percent)).toEqual([50, 30, 20])
    })

    it("desmarcar uma área refaz o percentual das outras", () => {
        const weights = computeAreaWeights(entries, new Set(["a1"]))

        expect(weights.totalKwh).toBe(50)
        expect(weights.slices.map((slice) => [slice.id, slice.percent])).toEqual([
            ["a2", 60],
            ["a3", 40],
        ])
    })

    it("sem nenhuma área selecionada não há fatia nem total", () => {
        const weights = computeAreaWeights(entries, new Set(["a1", "a2", "a3"]))

        expect(weights).toEqual({ slices: [], totalKwh: 0 })
    })

    it("selecionadas sem consumo: o percentual é ausência, não divisão por zero", () => {
        const zeroed = buildAreaWeightEntries([area("a1", "Cozinha")], byId([item("a1", 0)]))

        const weights = computeAreaWeights(zeroed, new Set())

        expect(weights.totalKwh).toBe(0)
        expect(weights.slices[0]?.percent).toBeNull()
    })
})

describe("formatWeightPercent", () => {
    it("arredonda para inteiro", () => {
        expect(formatWeightPercent(33.4)).toBe("33%")
        expect(formatWeightPercent(66.6)).toBe("67%")
    })

    it("fatia pequena não vira 0%", () => {
        expect(formatWeightPercent(0.4)).toBe("<1%")
    })

    it("zero de verdade é 0% e ausência é '-'", () => {
        expect(formatWeightPercent(0)).toBe("0%")
        expect(formatWeightPercent(null)).toBe("-")
    })
})
