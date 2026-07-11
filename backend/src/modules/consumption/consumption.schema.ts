import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"
import { paginationQuerySchema } from "@/shared/pagination.js"

export const granularitySchema = z.enum(["hour", "day", "month", "year"])
export type Granularity = z.infer<typeof granularitySchema>

export const listConsumptionQuerySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid({ message: "targetId inválido" }),
        granularity: granularitySchema,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
    })
    .extend(paginationQuerySchema.shape)

export type ListConsumptionQuery = z.infer<typeof listConsumptionQuerySchema>
