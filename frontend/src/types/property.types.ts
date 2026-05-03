/**
 * Tipos compartilhados de Propriedade.
 * Espelham as respostas do backend (PropertyResponse + schemas Zod).
 *
 * Campos opcionais no backend (address, city, state, zipCode) chegam como
 * `string | null` na resposta JSON porque o repository converte undefined→null
 * antes de persistir no Prisma.
 */

/**
 * UFs válidas — espelho do array do backend.
 * 26 estados + Distrito Federal.
 */
export const VALID_UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export type Uf = (typeof VALID_UFS)[number]

/** Property retornada pela API */
export interface Property {
    id: string
    userId: string
    distributorId: string
    name: string
    address: string | null
    city: string | null
    /**
     * UF — chega como string crua do backend, mas só pode ser uma das VALID_UFS
     * (validado pelo Zod no backend antes de persistir).
     */
    state: string | null
    zipCode: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Input do form de criação — body do POST /api/properties.
 * `distributorId` é obrigatório por regra de negócio (toda propriedade
 * tem que estar vinculada a uma distribuidora).
 */
export interface CreatePropertyInput {
    distributorId: string
    name: string
    address?: string
    city?: string
    state?: Uf
    zipCode?: string
}

/**
 * Input do form de edição.
 * Diferente de Distributor (CNPJ imutável), aqui distributorId pode ser
 * alterado — o backend permite trocar a distribuidora vinculada.
 */
export type UpdatePropertyInput = Partial<CreatePropertyInput>