import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Alerta de ultrapassagem de demanda contratada (Grupo A) — dispara quando
// a demanda medida de algum posto contratado atinge
// `thresholdPercent` da respectiva demanda contratada. `meterId` só é
// informado na criação — mesma imutabilidade de alvo de `alert.schema.ts`.

const DEFAULT_THRESHOLD_PERCENT = 105
// Teto arbitrário, mas não ilimitado: acima disso o alerta nunca dispararia
// na prática (a ultrapassagem já é penalizada a partir de 105% — um limiar
// de milhares por cento é erro de digitação, não configuração válida).
const MAX_THRESHOLD_PERCENT = 500

export const createDemandAlertSchema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    meterId: z.uuid({ message: "meterId inválido" }),

    thresholdPercent: z
        .number({ error: "thresholdPercent deve ser um número" })
        .positive({ message: "thresholdPercent deve ser maior que zero" })
        .max(MAX_THRESHOLD_PERCENT, {
            message: `thresholdPercent não pode ultrapassar ${MAX_THRESHOLD_PERCENT}`,
        })
        .optional()
        .default(DEFAULT_THRESHOLD_PERCENT),

    enabled: z.boolean().optional(),
})

export const updateDemandAlertSchema = z
    .object({
        name: z.string().min(1).max(200).optional(),

        thresholdPercent: z
            .number()
            .positive({ message: "thresholdPercent deve ser maior que zero" })
            .max(MAX_THRESHOLD_PERCENT, {
                message: `thresholdPercent não pode ultrapassar ${MAX_THRESHOLD_PERCENT}`,
            })
            .optional(),

        enabled: z.boolean().optional(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
        message: "Informe ao menos um campo para atualizar",
    })

export const patchEnabledSchema = z.object({
    enabled: z.boolean({ error: "enabled deve ser booleano" }),
})

export const listDemandAlertQuerySchema = paginationQuerySchema

export type CreateDemandAlertInput = z.infer<typeof createDemandAlertSchema>
export type UpdateDemandAlertInput = z.infer<typeof updateDemandAlertSchema>
export type PatchEnabledInput = z.infer<typeof patchEnabledSchema>
