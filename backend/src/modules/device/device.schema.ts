import { z } from "zod"

// Schema de criação

export const createDeviceSchema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),
    brand: z.string().max(100).optional(),
    model: z.string().max(100).optional(),

    powerWatts: z
        .number({ error: "powerWatts deve ser um número" })
        .positive({ message: "powerWatts deve ser maior que zero" })
        .optional(),
})

// Schema de atualização

export const updateDeviceSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    brand: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    powerWatts: z
        .number()
        .positive({ message: "powerWatts deve ser maior que zero" })
        .optional(),
})

// Tipos inferidos 

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>