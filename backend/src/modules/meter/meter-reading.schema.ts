import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"

// Só minuto/hora — granularidades maiores (dia+) são o domínio de
// /api/consumption (faturamento). Este endpoint existe pra reconstruir o
// gráfico "ao vivo" a partir do que já está persistido em MeterReading,
// sem custo/tarifa nenhum envolvido (ver meter-reading.service.ts).
export const meterReadingGranularitySchema = z.enum(["minute", "hour"])
export type MeterReadingGranularity = z.infer<typeof meterReadingGranularitySchema>

// from/to obrigatórios (ao contrário de /api/consumption) — não existe um
// "todas as leituras" plausível aqui; sem pagina o resultado, então a janela
// precisa vir sempre limitada por quem chama.
export const listMeterReadingsQuerySchema = z.object({
    targetType: targetTypeSchema,
    targetId: z.string().uuid({ message: "targetId inválido" }),
    granularity: meterReadingGranularitySchema,
    from: z.coerce.date(),
    to: z.coerce.date(),
})

export type ListMeterReadingsQuery = z.infer<typeof listMeterReadingsQuerySchema>

// As 9 grandezas do seletor da área de análise (design `LumiTrack Home v2`,
// bloco `gzMetrics()`) — os valores são as mesmas chaves curtas já usadas lá
// (`tensao`, `pativa`...), não nomes em inglês, para o cliente consumir a
// API sem tradução.
export const meterReadingSeriesMetricSchema = z.enum([
    "tensao",
    "corrente",
    "pativa",
    "preativa",
    "paparente",
    "fp",
    "thdv",
    "thdi",
    "freq",
])
export type MeterReadingSeriesMetric = z.infer<typeof meterReadingSeriesMetricSchema>

// "hora": bucket configurável (1/5/15/30 min) dentro de uma hora escolhida.
// "dia": 24 baldes fixos, hora a hora, do dia escolhido — sem depender de
// hour/aggregationMinutes (design `gzView`, campos desabilitados).
export const meterReadingSeriesWindowSchema = z.enum(["hora", "dia"])
export type MeterReadingSeriesWindow = z.infer<typeof meterReadingSeriesWindowSchema>

const AGGREGATION_MINUTES_OPTIONS = [1, 5, 15, 30] as const
export type MeterReadingSeriesAggregationMinutes = (typeof AGGREGATION_MINUTES_OPTIONS)[number]

const aggregationMinutesSchema = z.coerce
    .number()
    .refine((value): value is MeterReadingSeriesAggregationMinutes =>
        (AGGREGATION_MINUTES_OPTIONS as readonly number[]).includes(value),
    )

// Campos comuns às duas janelas — `day` é só a data (ano/mês/dia) do
// calendário local de São Paulo.
const seriesBaseFields = {
    targetType: targetTypeSchema,
    targetId: z.string().uuid({ message: "targetId inválido" }),
    metric: meterReadingSeriesMetricSchema,
    day: z.coerce.date({ error: "day deve ser uma data válida" }),
}

// `hour`/`aggregationMinutes` só fazem sentido com `window=hora` — um
// `z.discriminatedUnion` os torna obrigatórios (e só existentes) nessa
// variante, em vez de opcionais com `.refine` validando em runtime: o tipo
// inferido já nasce estreitado por `window`, sem precisar de asserção `!`
// em quem consome (`MeterReadingService.series`).
export const meterReadingSeriesQuerySchema = z.discriminatedUnion("window", [
    z.object({ ...seriesBaseFields, window: z.literal("dia") }),
    z.object({
        ...seriesBaseFields,
        window: z.literal("hora"),
        hour: z.coerce.number().int().min(0).max(23),
        aggregationMinutes: aggregationMinutesSchema,
    }),
])

export type MeterReadingSeriesQuery = z.infer<typeof meterReadingSeriesQuerySchema>

// Teto por período da comparação — mesma razão do
// MAX_COMPARISON_MONTHS de `consumption.schema.ts`: sem ele, os dois pontos
// de dado (from/to) na query string bastariam para pedir uma agregação
// arbitrariamente grande.
const MAX_COMPARE_PERIOD_DAYS = 92
const MAX_COMPARE_PERIOD_MS = MAX_COMPARE_PERIOD_DAYS * 24 * 60 * 60 * 1000

// GET /api/meter-readings/compare-periods — dois períodos arbitrários A/B da
// MESMA duração: A e B com durações diferentes não têm uma forma
// inambígua de alinhar os baldes no gráfico comparativo (nenhum eixo de data
// comum), então a mesma duração é regra do schema, não só do formulário.
export const meterReadingComparePeriodsQuerySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid({ message: "targetId inválido" }),
        metric: meterReadingSeriesMetricSchema,
        fromA: z.coerce.date({ error: "fromA deve ser uma data válida" }),
        toA: z.coerce.date({ error: "toA deve ser uma data válida" }),
        fromB: z.coerce.date({ error: "fromB deve ser uma data válida" }),
        toB: z.coerce.date({ error: "toB deve ser uma data válida" }),
    })
    .refine((data) => data.toA > data.fromA, {
        message: "Período A: to deve ser depois de from",
        path: ["toA"],
    })
    .refine((data) => data.toB > data.fromB, {
        message: "Período B: to deve ser depois de from",
        path: ["toB"],
    })
    .refine((data) => data.toA.getTime() - data.fromA.getTime() <= MAX_COMPARE_PERIOD_MS, {
        message: `Cada período não pode exceder ${MAX_COMPARE_PERIOD_DAYS} dias`,
        path: ["toA"],
    })
    .refine(
        (data) =>
            data.toA.getTime() - data.fromA.getTime() === data.toB.getTime() - data.fromB.getTime(),
        {
            message: "Período A e período B devem ter a mesma duração",
            path: ["toB"],
        },
    )

export type MeterReadingComparePeriodsQuery = z.infer<typeof meterReadingComparePeriodsQuerySchema>
