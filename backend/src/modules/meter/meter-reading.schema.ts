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
// (`tensao`, `pativa`...), não nomes em inglês, para o front-end da Fase 25
// consumir a API sem tradução.
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

// `day` é só a data (ano/mês/dia) do calendário local de São Paulo — a hora
// exata vem de `hour` (quando `window=hora`) ou é ignorada (quando
// `window=dia`, todas as 24h do dia entram). `hour`/`aggregationMinutes` só
// fazem sentido com `window=hora`; os `.refine` abaixo tornam isso
// obrigatório em vez de silenciosamente ignorado, para o cliente não montar
// uma janela errada sem perceber.
export const meterReadingSeriesQuerySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid({ message: "targetId inválido" }),
        metric: meterReadingSeriesMetricSchema,
        window: meterReadingSeriesWindowSchema,
        day: z.coerce.date({ error: "day deve ser uma data válida" }),
        hour: z.coerce.number().int().min(0).max(23).optional(),
        aggregationMinutes: aggregationMinutesSchema.optional(),
    })
    .refine((data) => data.window !== "hora" || data.hour !== undefined, {
        message: "hour é obrigatório quando window=hora",
        path: ["hour"],
    })
    .refine((data) => data.window !== "hora" || data.aggregationMinutes !== undefined, {
        message: "aggregationMinutes é obrigatório quando window=hora",
        path: ["aggregationMinutes"],
    })

export type MeterReadingSeriesQuery = z.infer<typeof meterReadingSeriesQuerySchema>
