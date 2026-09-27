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
