import { z } from "zod"

// Schema de criação
// propertyId NÃO entra no body — vem da URL (:propertyId).
// Isso é consistente com o padrão de rotas aninhadas: o contexto da propriedade
// é estabelecido pela URL, não pelo payload da requisição.

export const createAreaSchema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    description: z.string().min(1).max(1000).optional(),
})

// Schema de atualização
// propertyId não pode ser alterado — uma área não muda de propriedade.

export const updateAreaSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(1000).optional(),
})

// Tipos inferidos

export type CreateAreaInput = z.infer<typeof createAreaSchema>
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>