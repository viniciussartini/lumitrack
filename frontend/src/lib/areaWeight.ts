import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { AreaTreeNode } from "@/types/property.types"

/** Quantidade de tokens `--color-chart-cat-N` na paleta categórica. */
const CHART_CATEGORY_COUNT = 16

/** Cor da série `index` (0 é a primeira); passando de 16 séries a paleta recomeça. */
export const chartCategoryColor = (index: number): string =>
    `var(--color-chart-cat-${(index % CHART_CATEGORY_COUNT) + 1})`

/** Uma área com medidor e consumo no mês, com a cor que a representa. */
export interface AreaWeightEntry {
    id: string
    name: string
    kwh: number
    color: string
}

/**
 * As áreas que entram na pizza: as que o resumo do mês devolve, na ordem da
 * hierarquia. A cor é da posição nessa lista, então marcar e desmarcar áreas
 * não troca a cor das outras. Área sem medidor ou sem leitura no mês não está
 * no resumo e fica de fora.
 */
export const buildAreaWeightEntries = (
    areas: readonly AreaTreeNode[],
    byId: ReadonlyMap<string, ConsumptionSummaryItem>,
): AreaWeightEntry[] =>
    areas
        .flatMap((area) => {
            const item = byId.get(area.id)
            return item ? [{ id: area.id, name: area.name, kwh: item.kwhConsumed }] : []
        })
        .map((entry, index) => ({ ...entry, color: chartCategoryColor(index) }))

export interface WeightSlice extends AreaWeightEntry {
    /** Participação no total das áreas selecionadas; nulo quando esse total é zero. */
    percent: number | null
}

export interface AreaWeights {
    slices: WeightSlice[]
    totalKwh: number
}

/**
 * Participação de cada área selecionada no consumo das selecionadas.
 *
 * @param entries - Áreas com medidor.
 * @param deselectedIds - Ids que o usuário desmarcou; o resto está selecionado.
 */
export const computeAreaWeights = (
    entries: readonly AreaWeightEntry[],
    deselectedIds: ReadonlySet<string>,
): AreaWeights => {
    const selected = entries.filter((entry) => !deselectedIds.has(entry.id))
    const totalKwh = selected.reduce((total, entry) => total + entry.kwh, 0)
    return {
        slices: selected.map((entry) => ({
            ...entry,
            percent: totalKwh > 0 ? (entry.kwh / totalKwh) * 100 : null,
        })),
        totalKwh,
    }
}

/** Percentual da legenda: inteiro; fatia pequena não vira "0%"; ausência é "-". */
export const formatWeightPercent = (percent: number | null): string => {
    if (percent === null) return "-"
    if (percent > 0 && percent < 1) return "<1%"
    return `${Math.round(percent)}%`
}
