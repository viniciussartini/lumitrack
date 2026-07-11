import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

export const listAlertEventQuerySchema = z
    .object({
        alertId: z.uuid({ message: "alertId inválido" }),
    })
    .extend(paginationQuerySchema.shape)

export type ListAlertEventQuery = z.infer<typeof listAlertEventQuerySchema>
