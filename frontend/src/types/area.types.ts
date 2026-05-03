/**
 * Tipos compartilhados de Área.
 * Espelham as respostas do backend (AreaResponse + schemas Zod).
 *
 * Áreas são SEMPRE filhas de uma propriedade — o propertyId é parte da
 * identidade da área, não um detalhe secundário. Por isso ele aparece
 * em todas as assinaturas de service/hook como parâmetro obrigatório.
 *
 * Campo `description` no backend chega como `string | null` na resposta JSON
 * (o repository converte undefined→null antes de persistir no Prisma).
 */

/** Area retornada pela API */
export interface Area {
    id: string
    propertyId: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Input do form de criação — body do POST /api/properties/:propertyId/areas.
 * propertyId NÃO entra no body — vem da URL (decisão do backend).
 */
export interface CreateAreaInput {
    name: string
    description?: string
}

/**
 * Input do form de edição.
 * Tudo opcional — o backend faz `Object.fromEntries(...filter(undefined))`
 * pra não sobrescrever campos existentes com null inadvertidamente.
 */
export type UpdateAreaInput = Partial<CreateAreaInput>