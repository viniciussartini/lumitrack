import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Alerta por faixa de potência (Fase 4) — dispara quando a potência ativa do
// medidor sai de [referencePowerKw×1000×(1−tolerancePercent/100),
// referencePowerKw×1000×(1+tolerancePercent/100)]. `meterId` só é informado
// na criação — trocar o medidor de um alerta não é permitido (mesmo padrão
// de imutabilidade de alvo usado em `meter`).

export const createAlertSchema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    meterId: z.uuid({ message: "meterId inválido" }),

    referencePowerKw: z
        .number({ error: "referencePowerKw deve ser um número" })
        .positive({ message: "referencePowerKw deve ser maior que zero" }),

    tolerancePercent: z
        .number({ error: "tolerancePercent deve ser um número" })
        .min(0, { message: "tolerancePercent não pode ser negativo" })
        .max(100, { message: "tolerancePercent não pode ultrapassar 100" }),

    enabled: z.boolean().optional(),
})

export const updateAlertSchema = z.object({
    name: z.string().min(1).max(200).optional(),

    referencePowerKw: z
        .number()
        .positive({ message: "referencePowerKw deve ser maior que zero" })
        .optional(),

    tolerancePercent: z
        .number()
        .min(0, { message: "tolerancePercent não pode ser negativo" })
        .max(100, { message: "tolerancePercent não pode ultrapassar 100" })
        .optional(),

    enabled: z.boolean().optional(),
})

export const patchEnabledSchema = z.object({
    enabled: z.boolean({ error: "enabled deve ser booleano" }),
})

export const listAlertQuerySchema = paginationQuerySchema

export type CreateAlertInput = z.infer<typeof createAlertSchema>
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>
export type PatchEnabledInput = z.infer<typeof patchEnabledSchema>
