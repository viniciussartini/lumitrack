import { z } from "zod"

// Schema de criação
export const createAlertSchema = z.object({
    thresholdKwh: z
        .number({ error: "thresholdKwh deve ser um número" })
        .positive({ message: "thresholdKwh deve ser maior que zero" }),

    message: z.string().max(500).optional(),
})

// Schema de atualização
export const updateAlertSchema = z.object({
    thresholdKwh: z
        .number()
        .positive({ message: "thresholdKwh deve ser maior que zero" })
        .optional(),

    message: z.string().max(500).optional(),
})

// Schema de query params para listagem global
export const listAlertQuerySchema = z.object({
    // triggered=true → apenas alertas disparados (triggeredAt != null)
    // triggered=false → apenas alertas ainda não disparados
    // ausente → todos
    triggered: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
})

// Tipos inferidos

export type CreateAlertInput = z.infer<typeof createAlertSchema>
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>
export type ListAlertQuery = z.infer<typeof listAlertQuerySchema>