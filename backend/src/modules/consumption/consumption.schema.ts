import { z } from "zod"

// Enum de períodos

export const consumptionPeriodSchema = z.enum(["DAILY", "MONTHLY", "ANNUAL"])

// Schema de criação

export const createConsumptionSchema = z.object({
    period: consumptionPeriodSchema,

    // ISO 8601 string — convertida para Date pelo Zod.
    // referenceDate representa o início do período medido:
    //   DAILY  → o dia exato (ex: "2025-01-15")
    //   MONTHLY → o primeiro dia do mês (ex: "2025-01-01")
    //   ANNUAL  → o primeiro dia do ano (ex: "2025-01-01")
    referenceDate: z.iso.datetime({ offset: true }).or(z.iso.date()).pipe(z.coerce.date()),

    kwhConsumed: z
        .number({ error: "kwhConsumed deve ser um número" })
        .positive({ message: "kwhConsumed deve ser maior que zero" }),

    // costBrl é calculado automaticamente — não aceito no input
    notes: z.string().max(500).optional(),
})

// Schema de atualização

export const updateConsumptionSchema = z.object({
    // period e referenceDate não são editáveis — identificam o registro
    kwhConsumed: z
        .number()
        .positive({ message: "kwhConsumed deve ser maior que zero" })
        .optional(),

    notes: z.string().max(500).optional(),
})

// Schema de query params para listagem

export const listConsumptionQuerySchema = z.object({
    period: consumptionPeriodSchema.optional(),
})

// Tipos inferidos

export type CreateConsumptionInput = z.infer<typeof createConsumptionSchema>
export type UpdateConsumptionInput = z.infer<typeof updateConsumptionSchema>
export type ListConsumptionQuery = z.infer<typeof listConsumptionQuerySchema>
export type ConsumptionPeriod = z.infer<typeof consumptionPeriodSchema>