const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

export type ComparePeriodsGranularity = "hour" | "day"

/**
 * Deriva a granularidade do balde a partir da duração do período (garantida
 * igual nos dois pelo schema): até 1 dia vira balde por hora, mais que isso
 * vira balde por dia — não é escolha do usuário. Uma comparação pode cobrir
 * semanas ou meses; deixar a agregação por hora sem teto explodiria o volume
 * de pontos num período longo.
 */
export function deriveComparePeriodsGranularity(durationMs: number): ComparePeriodsGranularity {
    return durationMs <= DAY_MS ? "hour" : "day"
}

export interface ComparePeriodRange {
    from: Date
    to: Date
}

export interface ComparePeriodWindow extends ComparePeriodRange {
    bucketStarts: Date[]
}

export interface ComparePeriodsWindow {
    granularity: ComparePeriodsGranularity
    bucketSizeMs: number
    periodA: ComparePeriodWindow
    periodB: ComparePeriodWindow
}

/**
 * Baldes de um período são relativos ao PRÓPRIO início do período (`from`),
 * não a fronteiras de calendário (meia-noite, início da hora) — ao contrário
 * de `computeSeriesWindow` (Fase 25), que sempre analisa um único dia
 * calendário. Aqui A e B têm a mesma duração mas datas de calendário
 * normalmente diferentes; alinhar por calendário faria os dois períodos
 * terem contagens de balde diferentes sempre que um deles não começasse
 * exatamente numa fronteira de hora/dia. Alinhar pelo início de cada período
 * garante a MESMA contagem nos dois — é o que permite ao gráfico comparativo
 * plotar as duas séries por posição de balde, sem eixo de data comum.
 */
function computePeriodWindow(range: ComparePeriodRange, bucketSizeMs: number): ComparePeriodWindow {
    const bucketCount = Math.ceil((range.to.getTime() - range.from.getTime()) / bucketSizeMs)
    const bucketStarts = Array.from(
        { length: bucketCount },
        (_, i) => new Date(range.from.getTime() + i * bucketSizeMs),
    )
    return { ...range, bucketStarts }
}

/**
 * Janela dos dois períodos de uma comparação — a granularidade é derivada
 * uma única vez, a partir da duração de A (o schema já garante que B tem a
 * mesma duração), e aplicada aos dois.
 */
export function computeComparePeriodsWindow(
    periodA: ComparePeriodRange,
    periodB: ComparePeriodRange,
): ComparePeriodsWindow {
    const durationMs = periodA.to.getTime() - periodA.from.getTime()
    const granularity = deriveComparePeriodsGranularity(durationMs)
    const bucketSizeMs = granularity === "hour" ? HOUR_MS : DAY_MS

    return {
        granularity,
        bucketSizeMs,
        periodA: computePeriodWindow(periodA, bucketSizeMs),
        periodB: computePeriodWindow(periodB, bucketSizeMs),
    }
}

export interface PeriodSummary {
    min: number | null
    avg: number | null
    max: number | null
}

export interface PeriodDiff {
    absolute: number | null
    percent: number | null
}

/**
 * Diferença de B sobre A: absoluta é `médiaB - médiaA`; percentual é
 * relativa à média de A. `null` nos dois quando qualquer um dos períodos não
 * tem dado da grandeza (ausência não vira zero nem diferença inventada);
 * percentual também `null` quando a média de A é exatamente zero, para não
 * devolver `Infinity`/divisão por zero.
 */
export function computePeriodDiff(summaryA: PeriodSummary, summaryB: PeriodSummary): PeriodDiff {
    if (summaryA.avg === null || summaryB.avg === null) {
        return { absolute: null, percent: null }
    }

    const absolute = summaryB.avg - summaryA.avg
    const percent = summaryA.avg === 0 ? null : (absolute / summaryA.avg) * 100
    return { absolute, percent }
}
