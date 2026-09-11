import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Consulta ao catálogo global de PLD (Preço de Liquidação das Diferenças) —
// somente leitura, sem schema de criação/atualização: o catálogo é populado
// via seed, mesmo padrão do catálogo tarifário (distributor.schema.ts).

const submarketSchema = z.enum(["NORTH", "NORTHEAST", "SOUTHEAST_CENTER_WEST", "SOUTH"], {
    error: "Submercado deve ser NORTH, NORTHEAST, SOUTHEAST_CENTER_WEST ou SOUTH",
})

export const listPldQuoteQuerySchema = paginationQuerySchema.extend({
    submarket: submarketSchema.optional(),
    from: z.coerce.date({ error: "from deve ser uma data válida" }).optional(),
    to: z.coerce.date({ error: "to deve ser uma data válida" }).optional(),
})

export type ListPldQuoteQuery = z.infer<typeof listPldQuoteQuerySchema>
