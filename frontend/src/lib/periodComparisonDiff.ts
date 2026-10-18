import {
    PERIOD_VARIATION_TOLERANCE_PERCENT,
    resolvePeriodVariationToneClass,
} from "@/lib/comparisonTone"
import { countInclusiveDays, formatDays, type PeriodComparisonRun } from "@/lib/periodComparison"
import type {
    MeterReadingComparePeriodsResponse,
    MeterReadingPeriodDiff,
} from "@/types/meterReadingSeries.types"

const MINUS = "−"
const MISSING = "-"

const percentFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
})

/** A variação de B sobre A, em destaque na seção "Diferenças". */
export interface ComparisonVariation {
    text: string
    toneClass: string
    note: string
}

/**
 * Texto, cor e nota da variação de B sobre A. Sem percentual (um período sem
 * dado da grandeza, ou média de A igual a zero) mostra travessão em vez de
 * inventar um número — a nota diz qual dos dois casos é.
 *
 * @param diff - A diferença devolvida pela API.
 * @returns O texto formatado em pt-BR, a classe de cor e a nota explicativa.
 */
export function buildComparisonVariation(diff: MeterReadingPeriodDiff): ComparisonVariation {
    const { absolute, percent } = diff
    const toneClass = resolvePeriodVariationToneClass(percent)

    if (percent === null) {
        return {
            text: MISSING,
            toneClass,
            note:
                absolute === null
                    ? "Sem dados da grandeza em um dos períodos."
                    : "A média do período A é zero; a variação percentual não se aplica.",
        }
    }

    // O sinal sai do valor já arredondado: -0,04% arredondaria para "−0,0%",
    // um zero com sinal que contradiz a nota de períodos equivalentes.
    const magnitude = percentFormatter.format(Math.abs(percent))
    const sign = magnitude === percentFormatter.format(0) ? "" : percent > 0 ? "+" : MINUS
    const text = `${sign}${magnitude}%`
    if (Math.abs(percent) <= PERIOD_VARIATION_TOLERANCE_PERCENT) {
        return {
            text,
            toneClass,
            note: `Períodos equivalentes (variação de até ${PERIOD_VARIATION_TOLERANCE_PERCENT}%).`,
        }
    }
    return {
        text,
        toneClass,
        note: percent > 0 ? "Período B acima do período A." : "Período B abaixo do período A.",
    }
}

export interface ComparisonStat {
    label: string
    value: string
}

const formatOrMissing = (value: number | null, format: (raw: number) => string): string =>
    value === null ? MISSING : format(value)

const formatSignedDifference = (
    absolute: number | null,
    format: (raw: number) => string,
): string => {
    if (absolute === null) return MISSING
    if (absolute === 0) return format(0)
    return `${absolute > 0 ? "+" : MINUS}${format(Math.abs(absolute))}`
}

/**
 * Cards da seção "Diferenças": média de cada período, diferença absoluta,
 * pico (máximo) de cada período e quantos dias cada um cobre. Todas as
 * grandezas comparáveis são de média, então a média do período é o
 * agregado — não uma soma. Valor ausente vira travessão, nunca zero.
 *
 * @param run - A comparação submetida (para os dias de cada período).
 * @param data - A resposta da API para esse run.
 * @param format - Formatador da grandeza escolhida.
 * @returns Os cards, na ordem de exibição.
 */
export function buildComparisonStats(
    run: PeriodComparisonRun,
    data: MeterReadingComparePeriodsResponse,
    format: (raw: number) => string,
): ComparisonStat[] {
    const { periodA, periodB, diff } = data

    return [
        { label: "Média período A", value: formatOrMissing(periodA.summary.avg, format) },
        { label: "Média período B", value: formatOrMissing(periodB.summary.avg, format) },
        { label: "Diferença absoluta", value: formatSignedDifference(diff.absolute, format) },
        { label: "Pico período A", value: formatOrMissing(periodA.summary.max, format) },
        { label: "Pico período B", value: formatOrMissing(periodB.summary.max, format) },
        {
            label: "Dias por período",
            value: formatDays(countInclusiveDays(run.aStart, run.aEnd)),
        },
    ]
}
