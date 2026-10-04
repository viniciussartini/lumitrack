import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

export const MIN_GOAL_YEAR = 2020
export const MAX_GOAL_YEAR = 2100
export const MONTHS_IN_YEAR = 12
export const MIN_ALERT_PERCENT = 10
export const MAX_ALERT_PERCENT = 100

// Teto por mês: barra erro de digitação (zeros a mais) sem limitar consumo real.
const MAX_MONTHLY_KWH = 100_000_000

const yearSchema = (field: string) =>
    z
        .number({ error: `${field} deve ser um número` })
        .int({ message: `${field} deve ser inteiro` })
        .min(MIN_GOAL_YEAR, { message: `${field} deve ser a partir de ${MIN_GOAL_YEAR}` })
        .max(MAX_GOAL_YEAR, { message: `${field} deve ser até ${MAX_GOAL_YEAR}` })

// Campos que a edição também aceita. O ano e a propriedade ficam fora: mudar
// qualquer um dos dois seria outra meta, não a edição desta.
const goalValuesShape = {
    referenceYear: yearSchema("Ano de referência"),
    monthlyKwh: z
        .array(
            z
                .number({ error: "A meta de cada mês deve ser um número" })
                .min(0, { message: "A meta de cada mês não pode ser negativa" })
                .max(MAX_MONTHLY_KWH, { message: "A meta de um mês excede o limite permitido" }),
            { error: "monthlyKwh deve ser uma lista" },
        )
        .length(MONTHS_IN_YEAR, { message: `A meta deve ter os ${MONTHS_IN_YEAR} meses` }),
    alertPercent: z
        .number({ error: "O percentual de alerta deve ser um número" })
        .int({ message: "O percentual de alerta deve ser inteiro" })
        .min(MIN_ALERT_PERCENT, {
            message: `O percentual de alerta deve ser de ${MIN_ALERT_PERCENT} a ${MAX_ALERT_PERCENT}`,
        })
        .max(MAX_ALERT_PERCENT, {
            message: `O percentual de alerta deve ser de ${MIN_ALERT_PERCENT} a ${MAX_ALERT_PERCENT}`,
        }),
}

/** A base de referência é um ano anterior ao da meta. */
export const REFERENCE_BEFORE_YEAR_MESSAGE = "O ano de referência deve ser anterior ao ano da meta"

export const createGoalBodySchema = z
    .object({
        propertyId: z.uuid({ message: "propertyId inválido" }),
        year: yearSchema("Ano da meta"),
        ...goalValuesShape,
    })
    .refine((data) => data.referenceYear < data.year, {
        message: REFERENCE_BEFORE_YEAR_MESSAGE,
        path: ["referenceYear"],
    })

export const updateGoalBodySchema = z.object(goalValuesShape)

export type CreateGoalBody = z.infer<typeof createGoalBodySchema>
export type UpdateGoalBody = z.infer<typeof updateGoalBodySchema>

export const goalIdParamsSchema = z.object({
    id: z.uuid({ message: "id inválido" }),
})

export const listGoalsQuerySchema = z
    .object({ propertyId: z.uuid({ message: "propertyId inválido" }) })
    .extend(paginationQuerySchema.shape)
