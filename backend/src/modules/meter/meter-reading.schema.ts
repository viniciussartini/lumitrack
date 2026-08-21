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
