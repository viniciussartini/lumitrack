import { z } from "zod"

export const demandOverviewQuerySchema = z.object({
    propertyId: z.uuid({ message: "propertyId inválido" }),
})
