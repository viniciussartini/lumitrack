import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Contrato de energia de uma propriedade no Mercado Livre (ACL) —
// comercializadora, submercado, fonte e o preço/volume negociados
// bilateralmente. `propertyId` só é informado na criação — mesma
// imutabilidade de alvo de `alert.schema.ts`/`demand-alert.schema.ts`.

const submarketSchema = z.enum(["NORTH", "NORTHEAST", "SOUTHEAST_CENTER_WEST", "SOUTH"], {
    error: "Submercado deve ser NORTH, NORTHEAST, SOUTHEAST_CENTER_WEST ou SOUTH",
})

const energySourceSchema = z.enum(["CONVENTIONAL", "INCENTIVIZED_50", "INCENTIVIZED_100"], {
    error: "Fonte contratada deve ser CONVENTIONAL, INCENTIVIZED_50 ou INCENTIVIZED_100",
})

// Valida que, quando informado, o fim da vigência é posterior ao início —
// um contrato sem validTo é aberto (vigente até ser substituído por um novo).
function validPeriod(data: { validFrom: Date; validTo?: Date | undefined }): boolean {
    return data.validTo === undefined || data.validTo > data.validFrom
}
const VALID_PERIOD_MESSAGE = "O fim da vigência deve ser posterior ao início"

export const createAclContractSchema = z
    .object({
        propertyId: z.uuid({ message: "propertyId inválido" }),

        retailerName: z.string().min(1, { message: "Comercializadora é obrigatória" }).max(200),

        submarket: submarketSchema,

        energySource: energySourceSchema,

        energyPricePerMwh: z
            .number({ error: "energyPricePerMwh deve ser um número" })
            .positive({ message: "Preço da energia deve ser maior que zero" }),

        contractedVolumeMwh: z
            .number({ error: "contractedVolumeMwh deve ser um número" })
            .positive({ message: "Volume contratado deve ser maior que zero" }),

        validFrom: z.coerce.date({ error: "validFrom deve ser uma data válida" }),

        validTo: z.coerce.date({ error: "validTo deve ser uma data válida" }).optional(),
    })
    .refine(validPeriod, { message: VALID_PERIOD_MESSAGE, path: ["validTo"] })

export const updateAclContractSchema = z
    .object({
        retailerName: z.string().min(1).max(200).optional(),

        submarket: submarketSchema.optional(),

        energySource: energySourceSchema.optional(),

        energyPricePerMwh: z
            .number()
            .positive({ message: "Preço da energia deve ser maior que zero" })
            .optional(),

        contractedVolumeMwh: z
            .number()
            .positive({ message: "Volume contratado deve ser maior que zero" })
            .optional(),

        validFrom: z.coerce.date().optional(),

        validTo: z.coerce.date().optional(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
        message: "Informe ao menos um campo para atualizar",
    })
    .refine(
        (data) =>
            data.validFrom === undefined ||
            validPeriod({ validFrom: data.validFrom, validTo: data.validTo }),
        { message: VALID_PERIOD_MESSAGE, path: ["validTo"] },
    )

export const listAclContractQuerySchema = paginationQuerySchema.extend({
    propertyId: z.uuid({ message: "propertyId inválido" }).optional(),
})

export type CreateAclContractInput = z.infer<typeof createAclContractSchema>
export type UpdateAclContractInput = z.infer<typeof updateAclContractSchema>
export type ListAclContractQuery = z.infer<typeof listAclContractQuerySchema>
