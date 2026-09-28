import {
    formatApparentPowerKva,
    formatCurrentRms,
    formatElectricalPercent,
    formatFrequencyHz,
    formatPowerFactor,
    formatPowerKw,
    formatReactivePowerKvar,
    formatVoltageRms,
} from "@/lib/format"
import type {
    MeterReadingSeriesAggregationMinutes,
    MeterReadingSeriesBucket,
    MeterReadingSeriesMetric,
    MeterReadingSeriesWindow,
} from "@/types/meterReadingSeries.types"

export interface SeriesMetricDefinition {
    value: MeterReadingSeriesMetric
    label: string
    format: (raw: number) => string
}

/**
 * As 9 grandezas da área de análise configurável (LumiTrack Home v2.dc.html,
 * `gzMetrics()`), na mesma ordem do `<select>` do design. `format` reaproveita
 * os mesmos formatadores dos cards ao vivo da aba "Grandezas Elétricas"
 * (`electricalQuantities.ts`) — mesma grandeza, mesma convenção de exibição
 * em toda a aba, independente de vir do stream SSE ou desta série agregada.
 */
export const SERIES_METRICS: readonly SeriesMetricDefinition[] = [
    { value: "tensao", label: "Tensão (V)", format: formatVoltageRms },
    { value: "corrente", label: "Corrente (A)", format: formatCurrentRms },
    { value: "pativa", label: "Potência ativa (kW)", format: formatPowerKw },
    { value: "preativa", label: "Potência reativa (kvar)", format: formatReactivePowerKvar },
    { value: "paparente", label: "Potência aparente (kVA)", format: formatApparentPowerKva },
    { value: "fp", label: "Fator de potência", format: formatPowerFactor },
    { value: "thdv", label: "THD de tensão (%)", format: formatElectricalPercent },
    { value: "thdi", label: "THD de corrente (%)", format: formatElectricalPercent },
    { value: "freq", label: "Frequência (Hz)", format: formatFrequencyHz },
]

export function getSeriesMetricDefinition(
    metric: MeterReadingSeriesMetric,
): SeriesMetricDefinition {
    // SERIES_METRICS cobre as 9 chaves do tipo `MeterReadingSeriesMetric` —
    // o `find` nunca falha para um valor validado pelo próprio tipo.
    return SERIES_METRICS.find((definition) => definition.value === metric)!
}

export interface SeriesAggregationOption {
    value: MeterReadingSeriesAggregationMinutes
    label: string
}

export const AGGREGATION_OPTIONS: readonly SeriesAggregationOption[] = [
    { value: 1, label: "1 minuto" },
    { value: 5, label: "5 minutos" },
    { value: 15, label: "15 minutos" },
    { value: 30, label: "30 minutos" },
]

function getAggregationLabel(minutes: MeterReadingSeriesAggregationMinutes): string {
    return AGGREGATION_OPTIONS.find((option) => option.value === minutes)!.label
}

/**
 * Os parâmetros de uma consulta já submetida (distinto do rascunho do
 * formulário) — só existe depois de "Gerar análise", e é o que de fato
 * dirige a busca e a legenda dos resultados mostrados.
 */
export type SeriesRun =
    | {
          window: Extract<MeterReadingSeriesWindow, "dia">
          day: string
          metric: MeterReadingSeriesMetric
      }
    | {
          window: Extract<MeterReadingSeriesWindow, "hora">
          day: string
          hour: number
          aggregationMinutes: MeterReadingSeriesAggregationMinutes
          metric: MeterReadingSeriesMetric
      }

/**
 * Rótulo de um balde (eixo X do gráfico, coluna "Hora"/"Horário" da
 * tabela) — função pura do índice do balde e dos parâmetros da consulta,
 * não do `bucketStart` que a API devolve: o backend garante a mesma ordem
 * e contagem de `computeSeriesWindow` (24 baldes de hora em hora para
 * `dia`; um a cada `aggregationMinutes` a partir de `hour` para `hora`),
 * então o índice já basta — sem precisar desfazer a convenção "dígitos
 * locais mascarados como UTC" que o `bucketStart` da resposta carrega.
 */
export function buildSeriesBucketLabel(run: SeriesRun, index: number): string {
    if (run.window === "dia") return `${String(index).padStart(2, "0")}h`
    const minute = index * run.aggregationMinutes
    return `${String(run.hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export interface SeriesTableRow {
    label: string
    min: string
    avg: string
    max: string
}

const formatBucketValue = (value: number | null, format: (raw: number) => string): string =>
    value === null ? "-" : format(value)

/** Linhas da tabela Mínimo/Média/Máximo — grandeza ausente num balde vira "-", nunca 0. */
export function buildSeriesTableRows(
    run: SeriesRun,
    items: readonly MeterReadingSeriesBucket[],
): SeriesTableRow[] {
    const { format } = getSeriesMetricDefinition(run.metric)
    return items.map((item, index) => ({
        label: buildSeriesBucketLabel(run, index),
        min: formatBucketValue(item.min, format),
        avg: formatBucketValue(item.avg, format),
        max: formatBucketValue(item.max, format),
    }))
}

export interface SeriesChartPoint {
    label: string
    value: number | null
}

/**
 * Pontos do gráfico de linha — só a média de cada balde (o design plota uma
 * única linha; mínimo/máximo ficam só na tabela). `value: null` num balde
 * sem leitura vira um vazio no traçado (`connectNulls={false}` no gráfico),
 * nunca um ponto em 0.
 */
export function buildSeriesChartPoints(
    run: SeriesRun,
    items: readonly MeterReadingSeriesBucket[],
): SeriesChartPoint[] {
    return items.map((item, index) => ({
        label: buildSeriesBucketLabel(run, index),
        value: item.avg,
    }))
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
export function formatIsoDateToBr(isoDate: string): string {
    const [year, month, day] = isoDate.split("-")
    return `${day}/${month}/${year}`
}

/**
 * Legenda da consulta já executada (acima do gráfico) — "15/01/2026 · hora
 * a hora" para `window=dia`, "15/01/2026 · 14:00 · 5 minutos" para
 * `window=hora`.
 */
export function formatSeriesRunLabel(run: SeriesRun): string {
    const dateLabel = formatIsoDateToBr(run.day)
    if (run.window === "dia") return `${dateLabel} · hora a hora`
    const hourLabel = `${String(run.hour).padStart(2, "0")}:00`
    return `${dateLabel} · ${hourLabel} · ${getAggregationLabel(run.aggregationMinutes)}`
}
