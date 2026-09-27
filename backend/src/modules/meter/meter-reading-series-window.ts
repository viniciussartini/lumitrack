import { fromSaoPauloLocal } from "@/shared/time/localTime.js"
import type {
    MeterReadingSeriesAggregationMinutes,
    MeterReadingSeriesWindow,
} from "@/modules/meter/meter-reading.schema.js"

// Discriminada por `window` para que `hour`/`aggregationMinutes` sejam
// obrigatórios em TS exatamente quando `window="hora"` — o schema Zod já
// garante isso em runtime (`.refine`), mas não estreita o tipo inferido; esta
// union reintroduz a garantia no domínio, para quem chama `computeSeriesWindow`
// não precisar de `!` nem checar de novo.
export type SeriesWindowInput =
    | { window: Extract<MeterReadingSeriesWindow, "dia">; day: Date }
    | {
          window: Extract<MeterReadingSeriesWindow, "hora">
          day: Date
          hour: number
          aggregationMinutes: MeterReadingSeriesAggregationMinutes
      }

export interface SeriesWindow {
    /** Início real (UTC) da janela — usado no filtro `minuteStart >= rangeFrom`. */
    rangeFrom: Date
    /** Fim real (UTC, exclusivo) da janela — usado no filtro `minuteStart < rangeTo`. */
    rangeTo: Date
    /**
     * Início de cada balde esperado, na mesma convenção "dígitos locais de
     * SP mascarados como UTC" que `localTsExpr()` produz no SQL
     * (`MeterReadingRepository.findAggregated` já devolve `bucketStart` nesse
     * formato) — bate por igualdade de timestamp com o que a expressão SQL
     * do balde devolve, sem conversão extra.
     */
    bucketStarts: Date[]
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const HOURS_PER_DAY = 24

/**
 * Calcula a janela real (UTC) para o filtro `minuteStart` e a lista completa
 * de baldes esperados — 24 para `window="dia"`, `60 / aggregationMinutes`
 * para `window="hora"`. A lista é sempre completa mesmo quando uma hora não
 * tem nenhuma leitura: o balde aparece com `null`, nunca some do resultado
 * (ausência não é omissão silenciosa — quem monta a resposta final usa
 * {@link fillMissingBuckets} para preencher os que o banco não devolveu).
 *
 * @param input - Dia (calendário local de São Paulo), janela e, só para `window="hora"`, hora e agregação.
 * @returns A janela real e os baldes esperados, na convenção "dígitos locais".
 */
export function computeSeriesWindow(input: SeriesWindowInput): SeriesWindow {
    const startHour = input.window === "hora" ? input.hour : 0
    const maskedFrom = new Date(
        Date.UTC(
            input.day.getUTCFullYear(),
            input.day.getUTCMonth(),
            input.day.getUTCDate(),
            startHour,
            0,
            0,
            0,
        ),
    )
    const rangeFrom = fromSaoPauloLocal(maskedFrom)

    const bucketSizeMs = input.window === "dia" ? HOUR_MS : input.aggregationMinutes * MINUTE_MS
    const bucketCount = input.window === "dia" ? HOURS_PER_DAY : HOUR_MS / bucketSizeMs
    const rangeTo = new Date(rangeFrom.getTime() + bucketCount * bucketSizeMs)

    const bucketStarts = Array.from(
        { length: bucketCount },
        (_, i) => new Date(maskedFrom.getTime() + i * bucketSizeMs),
    )

    return { rangeFrom, rangeTo, bucketStarts }
}

export interface SeriesBucketValues {
    bucketStart: Date
    min: number | null
    avg: number | null
    max: number | null
}

/**
 * Completa a lista de baldes esperados com os valores agregados encontrados
 * no banco. Um balde sem nenhuma linha em `meter_readings` (medidor sem
 * leitura naquele intervalo) não aparece no resultado do `GROUP BY` — aqui
 * ele reaparece com `min`/`avg`/`max` nulos, nunca omitido.
 *
 * @param bucketStarts - Os baldes esperados, de {@link computeSeriesWindow}.
 * @param found - Os baldes que o banco realmente devolveu, em qualquer ordem.
 * @returns Um balde por `bucketStarts`, na mesma ordem, com `null` onde não havia dado.
 */
export function fillMissingBuckets(
    bucketStarts: Date[],
    found: SeriesBucketValues[],
): SeriesBucketValues[] {
    const byTime = new Map(found.map((bucket) => [bucket.bucketStart.getTime(), bucket]))

    return bucketStarts.map(
        (bucketStart) =>
            byTime.get(bucketStart.getTime()) ?? { bucketStart, min: null, avg: null, max: null },
    )
}
