import { formatIsoDateToBr } from "@/lib/meterReadingSeries"
import { addDaysToIsoDate, type PeriodComparisonRun } from "@/lib/periodComparison"
import type {
    ComparePeriodsGranularity,
    MeterReadingComparePeriodsResponse,
} from "@/types/meterReadingSeries.types"

/** Um ponto do gráfico: o mesmo balde (por posição) nos dois períodos. */
export interface ComparisonChartPoint {
    label: string
    valueA: number | null
    valueB: number | null
    /** Data real do balde no período A — mostrada no tooltip, já que o eixo X é por posição. */
    dateA: string
    dateB: string
}

/**
 * Legenda de um período, acima do gráfico.
 *
 * @param name - `A` ou `B`.
 * @param start - Primeiro dia (`YYYY-MM-DD`).
 * @param end - Último dia (`YYYY-MM-DD`).
 * @returns Ex.: `A · 01/01/2026 – 07/01/2026`.
 */
export function formatComparisonPeriodLabel(name: "A" | "B", start: string, end: string): string {
    return `${name} · ${formatIsoDateToBr(start)} – ${formatIsoDateToBr(end)}`
}

const buildBucketLabel = (granularity: ComparePeriodsGranularity, index: number): string =>
    granularity === "hour" ? `${String(index).padStart(2, "0")}h` : `Dia ${index + 1}`

// Só os períodos de um dia têm balde por hora, e um período de um dia tem uma
// única data; nos de vários dias cada balde é um dia, a um dia do anterior.
const bucketDate = (
    granularity: ComparePeriodsGranularity,
    periodStart: string,
    index: number,
): string => formatIsoDateToBr(addDaysToIsoDate(periodStart, granularity === "day" ? index : 0))

/**
 * Pontos do gráfico comparativo: o balde de mesma posição nos dois períodos
 * vira um ponto, porque A e B cobrem calendários diferentes e não têm eixo de
 * data comum. Só a média de cada balde é plotada; balde sem leitura (ou um
 * lado mais curto) vira `null`, um vazio no traçado, nunca um ponto em 0.
 *
 * @param run - A comparação submetida (datas de cada período).
 * @param response - A resposta da API para esse run.
 * @returns Um ponto por posição de balde, em ordem.
 */
export function buildComparisonChartPoints(
    run: PeriodComparisonRun,
    response: MeterReadingComparePeriodsResponse,
): ComparisonChartPoint[] {
    const { granularity, periodA, periodB } = response
    const length = Math.max(periodA.items.length, periodB.items.length)

    return Array.from({ length }, (_, index) => ({
        label: buildBucketLabel(granularity, index),
        valueA: periodA.items[index]?.avg ?? null,
        valueB: periodB.items[index]?.avg ?? null,
        dateA: bucketDate(granularity, run.aStart, index),
        dateB: bucketDate(granularity, run.bStart, index),
    }))
}
