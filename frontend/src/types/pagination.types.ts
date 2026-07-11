/**
 * Envelope de paginação universal — espelha `Paginated<T>` do backend
 * (`backend/src/shared/pagination.ts`). `pageSize` é limitado a 1–31 no
 * backend (zod); o frontend não revalida esse teto, só repassa o valor.
 */
export interface Paginated<T> {
    items: T[]
    total: number
    page: number
    pageSize: number
}

/** Parâmetros de página aceitos por qualquer listagem paginada. */
export interface PaginationParams {
    page?: number
    pageSize?: number
}

/** Default de itens por página usado pelas listagens do app. */
export const DEFAULT_PAGE_SIZE = 10
