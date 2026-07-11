import { z } from "zod"

export const tariffFlagEnumSchema = z.enum(["GREEN", "YELLOW", "RED_P1", "RED_P2"])

// Atualização da bandeira vigente e/ou dos valores de acréscimo por 100 kWh
// de cada bandeira — todos opcionais (atualização parcial).
export const updateTariffFlagSchema = z.object({
    currentFlag: tariffFlagEnumSchema.optional(),
    greenPer100Kwh: z.number().min(0).optional(),
    yellowPer100Kwh: z.number().min(0).optional(),
    redP1Per100Kwh: z.number().min(0).optional(),
    redP2Per100Kwh: z.number().min(0).optional(),
})

export type UpdateTariffFlagInput = z.infer<typeof updateTariffFlagSchema>
