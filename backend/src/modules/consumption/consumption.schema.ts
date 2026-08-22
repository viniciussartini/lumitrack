import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Tamanho do bucket de agregação — NÃO é a janela consultada. Quem escolhe a
// janela é o par `from`/`to`: a UI pede, por exemplo, bucket de minuto dentro
// da janela de uma hora (ver `lib/consumption/window.ts` no frontend).
export const granularitySchema = z.enum(["minute", "hour", "day", "month", "year"])
export type Granularity = z.infer<typeof granularitySchema>

// Ordem cronológica dos buckets. Default `desc` (mais recente primeiro) —
// é o que "traga os últimos N buckets" precisa (KPIs e comparação do painel).
// Listagens de janela pedem `asc` para paginar do início da janela para o fim.
export const bucketOrderSchema = z.enum(["asc", "desc"])
export type BucketOrder = z.infer<typeof bucketOrderSchema>

export const listConsumptionQuerySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid({ message: "targetId inválido" }),
        granularity: granularitySchema,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        order: bucketOrderSchema.default("desc"),
    })
    .extend(paginationQuerySchema.shape)

export type ListConsumptionQuery = z.infer<typeof listConsumptionQuerySchema>
